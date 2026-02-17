# Sandbox Agent SDK + Daytona

This example runs Sandbox Agent inside a Daytona sandbox, then connects to it from your local Node.js script via the `sandbox-agent` TypeScript SDK.

## Why Sandbox Agent SDK

Running coding agents remotely is hard. Most SDKs assume local execution, SSH-based approaches break streaming and interactive workflows, and each coding agent exposes a different API.

Sandbox Agent solves three problems:

- **Coding agents need sandboxes:** Sandbox Agent runs inside the sandbox and exposes HTTP/SSE so your app can control it remotely.
- **Every coding agent is different:** Sandbox Agent provides one API so you can swap agents without rewriting integrations.
- **Sessions are ephemeral:** Sandbox Agent emits a universal event schema so you can store, replay, and audit sessions outside the sandbox lifecycle.

## Features

- **Universal Agent API**

Claude Code, Codex, OpenCode, and Amp each have different APIs. Sandbox Agent exposes one HTTP API that works across all of them.

- **Streaming Events**

Real-time SSE stream of everything the agent does. Persist to your storage, replay sessions, audit everything.

- **Universal Schema**

Standardized session schema that covers all features of all agents. Includes tool calls, permission requests, file edits, etc.

- **Runs Inside Any Sandbox**

Run Sandbox Agent inside E2B, Daytona, Vercel Sandboxes, or Docker.

- **Full Session Lifecycle Management**

Create sessions, send messages, persist transcripts. Full session lifecycle management over HTTP.

- **OpenCode Support**

Experimental.

Connect OpenCode CLI, SDK, or web UI to control agents through familiar OpenCode tooling.

## Prerequisites

- **Node.js:** Version 18 or newer

## Environment Variables

Create a `.env` file with:

- `DAYTONA_API_KEY` (required)
- At least one model provider key:
  - `OPENAI_API_KEY` or `CODEX_API_KEY` (for `codex`)
  - `ANTHROPIC_API_KEY` (for `claude`)
- Optional: `AGENT` to explicitly select which agent to run

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the example:

   ```bash
   npm run start
   ```

3. Open the printed Inspector URL.

## How It Works

1. Creates a Daytona sandbox.
2. Installs `@sandbox-agent/cli@0.2.x` inside the sandbox.
3. Installs the selected agent.
4. Starts `sandbox-agent server` on port 3000.
5. Waits for health and creates a session using `sandbox-agent` SDK.

## References

- [Sandbox Agent](https://github.com/rivet-dev/sandbox-agent)
- [Daytona Documentation](https://www.daytona.io/docs)
