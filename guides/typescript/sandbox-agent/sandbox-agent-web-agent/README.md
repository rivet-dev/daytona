# Sandbox Agent SDK + Daytona

## Overview

This example runs Sandbox Agent inside a Daytona sandbox, then connects to it from your local Node.js script via the `sandbox-agent` TypeScript SDK.

## Features

- **Remote execution in Daytona:** Agent runtime and commands execute inside an isolated sandbox.
- **Local SDK control plane:** Your local script uses `SandboxAgent.connect(...)` to create and manage sessions.
- **Flexible agent selection:** Set `SANDBOX_AGENT` for any supported agent ID.
- **Simple runtime setup:** No snapshot required.

## Prerequisites

- **Node.js:** Version 18 or newer

## Environment Variables

Create a `.env` file with:

- `DAYTONA_API_KEY` (required)
- At least one model provider key:
  - `OPENAI_API_KEY` or `CODEX_API_KEY` (for `codex`)
  - `ANTHROPIC_API_KEY` (for `claude`)
- Optional: `SANDBOX_AGENT` to explicitly select an agent ID

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
3. Starts a local ACP registry override and installs the selected agent.
4. Starts `sandbox-agent server` on port 3000.
5. Waits for health and creates a session using `sandbox-agent` SDK.

## References

- [Sandbox Agent](https://github.com/rivet-dev/sandbox-agent)
- [Daytona Documentation](https://www.daytona.io/docs)
