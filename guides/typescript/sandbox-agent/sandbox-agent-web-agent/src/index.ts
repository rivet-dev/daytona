/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Daytona, Sandbox } from '@daytonaio/sdk'
import { SandboxAgent } from 'sandbox-agent'
import * as dotenv from 'dotenv'

dotenv.config()

const SANDBOX_AGENT_PORT = 3000
const ACP_REGISTRY_PORT = 17899
const SERVER_TOKEN = 'sandbox-agent-daytona-demo-token'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getAgentId(): string {
  const explicitAgent = process.env.SANDBOX_AGENT?.trim()
  if (explicitAgent) return explicitAgent

  if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) return 'codex'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'

  throw new Error('Set SANDBOX_AGENT or provide OPENAI_API_KEY/CODEX_API_KEY/ANTHROPIC_API_KEY')
}

function buildInspectorUrl(baseUrl: string, token: string, sessionId: string): string {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${root}/ui/?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`
}

async function waitForHealth(baseUrl: string, token: string): Promise<void> {
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${baseUrl}/v1/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (response.ok) {
        const body = await response.json()
        if (body?.status === 'ok') return
      }
    } catch {
      // Ignore transient startup/network failures while waiting for readiness.
    }

    await sleep(500)
  }

  throw new Error('Timed out waiting for Sandbox Agent health endpoint')
}

async function main(): Promise<void> {
  if (!process.env.DAYTONA_API_KEY) {
    console.error('Error: DAYTONA_API_KEY environment variable is not set')
    process.exit(1)
  }

  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })
  const agent = getAgentId()

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
    console.log('Creating sandbox...')
    sandbox = await daytona.create({ envVars, autoStopInterval: 0 })

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

    console.log('Installing Sandbox Agent CLI...')
    await runChecked(
      "bash -lc 'set -euo pipefail; npm install -g @sandbox-agent/cli@0.2.x; command -v sandbox-agent >/dev/null; sandbox-agent --version'",
    )

    console.log(`Installing agent (${agent})...`)
    await runChecked('bash -lc "printf \'{\\"agents\\":[]}\\n\' >/tmp/acp-registry.json"')
    await runChecked(
      `nohup python3 -m http.server ${ACP_REGISTRY_PORT} --bind 127.0.0.1 --directory /tmp >/tmp/acp-registry.log 2>&1 &`,
    )
    await runChecked(`sleep 1; pgrep -af 'http.server ${ACP_REGISTRY_PORT}' >/dev/null`)
    await runChecked(
      `bash -lc 'SANDBOX_AGENT_ACP_REGISTRY_URL=http://127.0.0.1:${ACP_REGISTRY_PORT}/acp-registry.json sandbox-agent install-agent ${agent}'`,
    )

    console.log('Starting Sandbox Agent server...')
    await runChecked(
      `nohup sandbox-agent server --token ${SERVER_TOKEN} --host 0.0.0.0 --port ${SANDBOX_AGENT_PORT} >/tmp/sandbox-agent.log 2>&1 &`,
    )
    await runChecked("sleep 1; pgrep -af 'sandbox-agent server' >/dev/null")

    const baseUrl = (await sandbox.getPreviewLink(SANDBOX_AGENT_PORT)).url

    console.log('Waiting for server health...')
    await waitForHealth(baseUrl, SERVER_TOKEN)

    const sdk = await SandboxAgent.connect({ baseUrl, token: SERVER_TOKEN })
    const session = await sdk.createSession({ agent })

    console.log(`Inspector UI: ${buildInspectorUrl(baseUrl, SERVER_TOKEN, session.id)}`)
    console.log('Session is ready. Press Ctrl+C to delete sandbox and exit.')

    // Keep the process alive until interrupted.
    while (true) {
      await sleep(60_000)
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
