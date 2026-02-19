# Sandbox Agent SDK + Daytona

This example runs Sandbox Agent inside a Daytona sandbox, then connects to it from your local Node.js script via the [Sandbox Agent TypeScript SDK](https://sandboxagent.dev/docs/sdk-overview) (npm: [`sandbox-agent`](https://www.npmjs.com/package/sandbox-agent)).

## Why Sandbox Agent SDK

Running coding agents remotely is hard. Most SDKs assume local execution, SSH breaks streaming/TTY behavior, and each coding agent has different APIs and event formats.

Sandbox Agent SDK gives you one integration surface:

- Run the server in a sandbox and control it over HTTP/SSE.
- Use one API across supported coding agents.
- Stream events in a consistent schema so you can persist and replay sessions. See [session persistence](https://sandboxagent.dev/docs/session-persistence).

## Prerequisites

- **Node.js:** Version 18 or newer

## Environment Variables

Create a `.env` file with:

- `DAYTONA_API_KEY` (required)
- At least one provider key:
  - `OPENAI_API_KEY` or `CODEX_API_KEY` (for `codex`)
  - `ANTHROPIC_API_KEY` (for `claude`)
- For additional agent credential options, see [Sandbox Agent credentials docs](https://sandboxagent.dev/docs/credentials).

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the example:

   ```bash
   npm run start
   ```

   The first run builds a Daytona snapshot and can take a few minutes. After that, the script reuses it automatically.

3. Open the printed Inspector URL.

## How It Works

1. Prepares a Daytona snapshot for the detected provider-backed agent.
2. Creates a sandbox from that snapshot.
3. Starts `sandbox-agent server` inside Daytona.
4. Creates a session with `SandboxAgent.connect(...)` and `createSession(...)`.
5. Prints the Inspector URL.

To run a prompt and stream events in your terminal, uncomment the section in `src/index.ts`:

```ts
// const off = session.onEvent((event) => {
//   console.log(`[event] ${event.type}`)
// })
// await session.prompt([{ type: 'text', text: 'Reply with exactly: sandbox-agent-ready' }])
// off()
```

## References

- [Sandbox Agent SDK docs](https://sandboxagent.dev/docs/sdk-overview)
- [Sandbox Agent session persistence](https://sandboxagent.dev/docs/session-persistence)
- [Sandbox Agent credentials](https://sandboxagent.dev/docs/credentials)
- [`sandbox-agent` npm package](https://www.npmjs.com/package/sandbox-agent)
- [Sandbox Agent](https://github.com/rivet-dev/sandbox-agent)
- [Daytona Documentation](https://www.daytona.io/docs)
