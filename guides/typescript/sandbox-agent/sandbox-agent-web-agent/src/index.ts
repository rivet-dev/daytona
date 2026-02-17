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

function getAgent(): string {
  const explicitAgent = process.env.AGENT?.trim()
  if (explicitAgent) return explicitAgent

  if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) return 'codex'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'

  throw new Error('Set AGENT or provide OPENAI_API_KEY/CODEX_API_KEY/ANTHROPIC_API_KEY')
}

function getSnapshotName(agent: string): string {
  const explicit = process.env.SNAPSHOT_NAME?.trim()
  if (explicit) return explicit
  return `sandbox-agent-${agent}`
}

async function ensureSnapshot(daytona: Daytona, snapshotName: string, agent: string): Promise<void> {
  try {
    const snapshot = await daytona.snapshot.get(snapshotName)
    if (snapshot.state !== 'active') {
      console.log(`Activating snapshot "${snapshotName}" (state: ${snapshot.state})...`)
      await daytona.snapshot.activate(snapshot)
    }
    return
  } catch {
    // Snapshot does not exist or isn't accessible. We'll attempt to create it below.
  }

  console.log(`Snapshot "${snapshotName}" not found. Building it now...`)
  console.log('Note: the first build can take several minutes. Subsequent runs reuse the snapshot.')

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
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 120_000

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
  const agent = getAgent()
  const snapshotName = getSnapshotName(agent)

  const envVars: Record<string, string> = {}
  if (process.env.ANTHROPIC_API_KEY) envVars.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (process.env.OPENAI_API_KEY) envVars.OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (process.env.CODEX_API_KEY) envVars.CODEX_API_KEY = process.env.CODEX_API_KEY
  if (!envVars.CODEX_API_KEY && envVars.OPENAI_API_KEY) envVars.CODEX_API_KEY = envVars.OPENAI_API_KEY

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
    console.log(`Ensuring snapshot exists: ${snapshotName}`)
    await ensureSnapshot(daytona, snapshotName, agent)

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
    await runChecked("sleep 1; pgrep -af 'sandbox-agent server' >/dev/null")

    const baseUrl = (await sandbox.getPreviewLink(SERVER_PORT)).url

    console.log('Waiting for server health...')
    await waitForHealth(baseUrl)

    const sdk = await SandboxAgent.connect({ baseUrl })
    const session = await sdk.createSession({ agent })

    const inspectorUrl = new URL(`/ui/sessions/${encodeURIComponent(session.id)}`, baseUrl).toString()
    console.log(`Inspector UI: ${inspectorUrl}`)
    console.log('Session is ready. Press Ctrl+C to delete sandbox and exit.')

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
