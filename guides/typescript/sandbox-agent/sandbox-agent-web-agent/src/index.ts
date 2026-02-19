/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Daytona, Image, Sandbox } from '@daytonaio/sdk'
import { SandboxAgent } from 'sandbox-agent'
import * as dotenv from 'dotenv'
import { setTimeout as delay } from 'node:timers/promises'

dotenv.config()

const SERVER_PORT = 3000
const SANDBOX_AGENT_CLI_VERSION = '0.2.x'
const SNAPSHOT_BASE_IMAGE = 'daytonaio/sandbox:0.6.0'
const HEALTH_TIMEOUT_MS = 120_000

function chooseAgent(envVars: Record<string, string>): string {
  if (envVars.OPENAI_API_KEY || envVars.CODEX_API_KEY) return 'codex'
  if (envVars.ANTHROPIC_API_KEY) return 'claude'
  throw new Error('Set OPENAI_API_KEY/CODEX_API_KEY or ANTHROPIC_API_KEY')
}

async function ensureSnapshot(daytona: Daytona, agent: string): Promise<string> {
  const snapshotName = `sandbox-agent-${agent}`

  try {
    const snapshot = await daytona.snapshot.get(snapshotName)
    if (snapshot.state !== 'active') {
      console.log(`Activating snapshot "${snapshotName}" (state: ${snapshot.state})...`)
      await daytona.snapshot.activate(snapshot)
    }
    return snapshotName
  } catch {
    // Snapshot not found yet. Create it below.
  }

  console.log(`Snapshot "${snapshotName}" not found. Building it now...`)
  console.log('First build can take several minutes. Future runs reuse this snapshot automatically.')

  const image = Image.base(SNAPSHOT_BASE_IMAGE).runCommands([
    'bash',
    '-lc',
    [
      'set -euo pipefail',
      `npm install -g @sandbox-agent/cli@${SANDBOX_AGENT_CLI_VERSION}`,
      'command -v sandbox-agent >/dev/null',
      'sandbox-agent --version',
      `sandbox-agent install-agent ${agent}`,
    ].join('; '),
  ])

  await daytona.snapshot.create(
    {
      name: snapshotName,
      image,
    },
    {
      timeout: 0,
      onLogs: (chunk) => process.stdout.write(chunk),
    },
  )

  return snapshotName
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/v1/health`, {
        signal: AbortSignal.timeout(5_000),
      })

      if (response.ok) {
        const body = await response.json()
        if (body?.status === 'ok') return
      }
    } catch {
      // Ignore transient startup/network failures while waiting for readiness.
    }

    await delay(500)
  }

  throw new Error('Timed out waiting for Sandbox Agent health endpoint')
}

async function main(): Promise<void> {
  if (!process.env.DAYTONA_API_KEY) {
    console.error('Error: DAYTONA_API_KEY environment variable is not set')
    process.exit(1)
  }

  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })

  const envVars: Record<string, string> = {}
  if (process.env.ANTHROPIC_API_KEY) envVars.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (process.env.OPENAI_API_KEY) envVars.OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (process.env.CODEX_API_KEY) envVars.CODEX_API_KEY = process.env.CODEX_API_KEY
  if (!envVars.CODEX_API_KEY && envVars.OPENAI_API_KEY) envVars.CODEX_API_KEY = envVars.OPENAI_API_KEY

  const agent = chooseAgent(envVars)

  let sandbox: Sandbox | undefined
  let cleaningUp = false

  const cleanup = async (exitCode: number) => {
    if (cleaningUp) return
    cleaningUp = true

    if (sandbox) {
      try {
        await sandbox.delete()
      } catch (error) {
        console.error('Failed to delete sandbox:', error)
      }
    }

    process.exit(exitCode)
  }

  try {
    console.log(`Preparing snapshot for ${agent}...`)
    const snapshotName = await ensureSnapshot(daytona, agent)

    console.log('Creating sandbox from snapshot...')
    sandbox = await daytona.create({ snapshot: snapshotName, envVars, autoStopInterval: 0 })

    process.once('SIGINT', () => {
      void cleanup(0)
    })
    process.once('SIGTERM', () => {
      void cleanup(0)
    })

    const runChecked = async (command: string) => {
      if (!sandbox) throw new Error('Sandbox not initialized')
      const result = await sandbox.process.executeCommand(command)
      if (result.exitCode !== 0) {
        throw new Error(`Command failed (${result.exitCode}): ${command}\n${result.result || ''}`.trim())
      }
    }

    console.log('Starting Sandbox Agent server...')
    await runChecked(
      `nohup sandbox-agent --no-token server --host 0.0.0.0 --port ${SERVER_PORT} >/tmp/sandbox-agent.log 2>&1 &`,
    )
    await runChecked("sleep 1; pgrep -af 'sandbox-agent.*server' >/dev/null")

    // Signed preview URL embeds auth in the URL, so we don't need custom headers.
    const baseUrl = (await sandbox.getSignedPreviewUrl(SERVER_PORT, 4 * 60 * 60)).url

    console.log('Waiting for server health...')
    await waitForHealth(baseUrl)

    const sdk = await SandboxAgent.connect({ baseUrl })
    const session = await sdk.createSession({ agent })

    const inspectorUrl = new URL(`/ui/sessions/${encodeURIComponent(session.id)}`, baseUrl).toString()
    console.log(`Inspector UI: ${inspectorUrl}`)
    console.log('Session is ready.')

    // Uncomment to run one prompt and stream events in your terminal.
    // const off = session.onEvent((event) => {
    //   console.log(`[event] ${event.type}`)
    // })
    // await session.prompt([{ type: 'text', text: 'Reply with exactly: sandbox-agent-ready' }])
    // off()

    console.log('Press Ctrl+C to delete sandbox and exit.')

    // Keep the process alive until interrupted.
    while (true) {
      await delay(60_000)
    }
  } catch (error) {
    console.error('Error:', error)
    await cleanup(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
