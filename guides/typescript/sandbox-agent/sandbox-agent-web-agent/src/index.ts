/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Daytona, Image } from '@daytonaio/sdk'
import { SandboxAgent } from 'sandbox-agent'
import * as dotenv from 'dotenv'
import { setTimeout as delay } from 'node:timers/promises'

dotenv.config()

const SNAPSHOT = 'sandbox-agent-ready'
const SERVER_PORT = 3000
const SANDBOX_AGENT_CLI_VERSION = '0.2.x'
const SNAPSHOT_BASE_IMAGE = 'daytonaio/sandbox:0.6.0'

function getEnvVars(): Record<string, string> {
  const envVars: Record<string, string> = {}
  if (process.env.ANTHROPIC_API_KEY) envVars.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (process.env.OPENAI_API_KEY) envVars.OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (process.env.CODEX_API_KEY) envVars.CODEX_API_KEY = process.env.CODEX_API_KEY
  if (!envVars.CODEX_API_KEY && envVars.OPENAI_API_KEY) envVars.CODEX_API_KEY = envVars.OPENAI_API_KEY
  return envVars
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/v1/health`, { signal: AbortSignal.timeout(5_000) })
      if (response.ok) {
        const body = await response.json()
        if (body?.status === 'ok') return
      }
    } catch {
      // Retry until timeout.
    }
    await delay(500)
  }
  throw new Error('Timed out waiting for /v1/health')
}

async function main(): Promise<void> {
  if (!process.env.DAYTONA_API_KEY) throw new Error('Set DAYTONA_API_KEY')

  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })
  const envVars = getEnvVars()
  if (!envVars.ANTHROPIC_API_KEY && !envVars.OPENAI_API_KEY && !envVars.CODEX_API_KEY) {
    throw new Error('Set OPENAI_API_KEY/CODEX_API_KEY or ANTHROPIC_API_KEY')
  }

  const agent = envVars.ANTHROPIC_API_KEY ? 'claude' : 'codex'
  const hasSnapshot = await daytona.snapshot.get(SNAPSHOT).then(
    () => true,
    () => false,
  )

  if (!hasSnapshot) {
    console.log(`Snapshot "${SNAPSHOT}" not found. Building it now...`)
    console.log('First build can take several minutes. Future runs reuse this snapshot automatically.')

    await daytona.snapshot.create(
      {
        name: SNAPSHOT,
        image: Image.base(SNAPSHOT_BASE_IMAGE).runCommands([
          'bash',
          '-lc',
          [
            'set -euo pipefail',
            `npm install -g @sandbox-agent/cli@${SANDBOX_AGENT_CLI_VERSION}`,
            'sandbox-agent --version',
            'sandbox-agent install-agent claude',
            'sandbox-agent install-agent codex',
          ].join('; '),
        ]),
      },
      { timeout: 0, onLogs: (chunk) => process.stdout.write(chunk) },
    )
  }

  const sandbox = await daytona.create({ snapshot: SNAPSHOT, envVars, autoStopInterval: 0 })

  const run = async (command: string) => {
    const result = await sandbox.process.executeCommand(command)
    if (result.exitCode !== 0) {
      throw new Error(`Command failed (${result.exitCode}): ${command}\n${result.result || ''}`.trim())
    }
  }

  await run(`nohup sandbox-agent --no-token server --host 0.0.0.0 --port ${SERVER_PORT} >/tmp/sandbox-agent.log 2>&1 &`)
  await run("sleep 1; pgrep -af 'sandbox-agent.*server' >/dev/null")

  const baseUrl = (await sandbox.getSignedPreviewUrl(SERVER_PORT, 4 * 60 * 60)).url
  await waitForHealth(baseUrl)

  const sdk = await SandboxAgent.connect({ baseUrl })
  const session = await sdk.createSession({ agent })
  console.log(`Inspector UI: ${new URL(`/ui/sessions/${encodeURIComponent(session.id)}`, baseUrl)}`)

  // Optional: uncomment to run one prompt and stream events.
  // const off = session.onEvent((event) => console.log(`[event] ${event.type}`))
  // await session.prompt([{ type: 'text', text: 'Reply with exactly: sandbox-agent-ready' }])
  // off()

  if (process.env.KEEP_ALIVE === '1') {
    console.log('KEEP_ALIVE=1 set. Press Ctrl+C to delete sandbox and exit.')
    process.once('SIGINT', async () => {
      await sdk.dispose()
      await sandbox.delete()
      process.exit(0)
    })
    process.once('SIGTERM', async () => {
      await sdk.dispose()
      await sandbox.delete()
      process.exit(0)
    })
    while (true) await delay(60_000)
  }

  await sdk.dispose()
  await sandbox.delete()
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
