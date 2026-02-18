# Sandbox Agent SDK + Daytona

This example runs Sandbox Agent inside a Daytona sandbox, then connects to it from your local Node.js script via the [Sandbox Agent TypeScript SDK](https://sandboxagent.dev/docs/sdk-overview) (npm: [`sandbox-agent`](https://www.npmjs.com/package/sandbox-agent)).

## Why Sandbox Agent SDK

Running coding agents remotely is hard. Most SDKs assume local execution, SSH-based approaches break streaming and interactive workflows, and each coding agent exposes a different API.

Sandbox Agent solves three problems:

- **Coding agents need sandboxes:** Sandbox Agent runs inside the sandbox and exposes HTTP/SSE so your app can control it remotely.
- **Every coding agent is different:** Sandbox Agent provides one API so you can swap agents without rewriting integrations.
- **Sessions are ephemeral:** Sandbox Agent emits a universal event schema so you can store, replay, and audit sessions outside the sandbox lifecycle. See [session persistence](https://sandboxagent.dev/docs/session-persistence).

## Features

- **Universal Agent API**

Claude Code, Codex, OpenCode, and Amp each have different APIs. Sandbox Agent exposes one HTTP API that works across all of them.

- **Streaming Events**

Real-time SSE stream of everything the agent does. Persist to your storage, replay sessions, audit everything.

- **Universal Schema**

Standardized session schema that covers all features of all agents. Includes tool calls, permission requests, file edits, etc.

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
- Other agents may require additional credentials. Set any extra provider keys as environment variables so they are available inside the sandbox.
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

   The first run builds a Daytona snapshot (so setup doesn't repeat every time). This can take several minutes.

3. Open the printed Inspector URL.

## How It Works

1. Ensures a Daytona snapshot exists for the selected agent (building it on the first run).
2. Creates a sandbox from that snapshot.
3. Starts `sandbox-agent server` on port 3000.
4. Waits for health and creates a session using `sandbox-agent` SDK.

## References

- [Sandbox Agent SDK docs](https://sandboxagent.dev/docs/sdk-overview)
- [`sandbox-agent` npm package](https://www.npmjs.com/package/sandbox-agent)
- [Sandbox Agent](https://github.com/rivet-dev/sandbox-agent)
- [Daytona Documentation](https://www.daytona.io/docs)
