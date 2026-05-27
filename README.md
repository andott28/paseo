# GAA

This `mvp` directory is a standalone workspace that can be moved out of `gaa` and run independently.

## Implemented architecture

- `apps/daemon`: local daemon (Fastify + WebSocket + SQLite)
- `apps/client`: Expo app for iOS/Android and web PWA
- `apps/desktop`: Electron desktop shell + Windows installer target
- `packages/protocol`: shared pairing and message contracts

The daemon supports `codex`, `claude`, and `opencode` through a provider registry with CLI-based adapters.

## Implemented core flow

1. Generate QR pairing offer from daemon (`/pairing/offer`)
2. Pair phone/PWA by redeeming token (`/pairing/redeem`)
3. Connect with WebSocket hello/welcome auth
4. Create agents, stream output, send follow-ups, stop, archive
5. Persist agents and timeline events in SQLite

## Efficiency profile

- No relay subsystem
- No duplicated timeline stores
- Event retention compaction in SQLite with summary events

## Quick start

```bash
cd mvp
npm install
npm run desktop:run
```

This starts daemon + exported web UI inside the desktop app.

## Mobile/Web dev mode

```bash
cd mvp
npm run dev:daemon
npm run dev:client
```

### Pairing flow

1. Call daemon `POST /pairing/offer` to get `url` and `qr`
2. Paste/scan offer in the Expo app Pair screen
3. App redeems token and opens WebSocket session

## CLI

`gaa` now includes a local CLI workspace at `apps/cli` with core lifecycle commands.

```bash
npm run build:cli
node apps/cli/dist/index.js pair http://127.0.0.1:9777
node apps/cli/dist/index.js ls
node apps/cli/dist/index.js projects
node apps/cli/dist/index.js project-add "gaa" "C:\\path\\to\\repo"
node apps/cli/dist/index.js workspaces
node apps/cli/dist/index.js workspace-create <projectId> "feature-auth" auth-branch
node apps/cli/dist/index.js terminals
node apps/cli/dist/index.js terminal-create <workspaceId>
node apps/cli/dist/index.js terminal-input <terminalId> "npm test`n"
node apps/cli/dist/index.js terminal-output <terminalId>
node apps/cli/dist/index.js terminal-kill <terminalId>
node apps/cli/dist/index.js mode <agentId> plan ask
node apps/cli/dist/index.js permissions
node apps/cli/dist/index.js approve <permissionId>
node apps/cli/dist/index.js schedules
node apps/cli/dist/index.js schedule-add codex C:\\path\\to\\repo 300 "run smoke checks"
node apps/cli/dist/index.js mcp-add local-mcp node "server.js"
node apps/cli/dist/index.js mcp-start <serverId>
node apps/cli/dist/index.js relay-open
node apps/cli/dist/index.js voice-start <agentId>
node apps/cli/dist/index.js voice-chunk <voiceSessionId> "continue with fix" --send
node apps/cli/dist/index.js run codex C:\\path\\to\\repo "implement feature X"
node apps/cli/dist/index.js runw codex <workspaceId> "implement feature X"
node apps/cli/dist/index.js send <agentId> "add tests"
node apps/cli/dist/index.js stop <agentId>
node apps/cli/dist/index.js archive <agentId>
node apps/cli/dist/index.js logs <agentId>
```

Notes:
- `pair` stores daemon credentials in `~/.gaa/session.json`.
- `ls` and `logs` use bearer auth over daemon HTTP endpoints.
- `run`/`runw`/`send`/`stop`/`archive` authenticate over WebSocket and send protocol envelopes.
- `project-add` creates a project plus its `main` workspace; `workspace-create` creates git worktrees.
- terminal endpoints are daemon-backed and stream over WebSocket to connected clients.
- agent mode and permission mode are first-class controls (`chat|plan|auto`, `allow|ask|deny`) with queue-based approval in ask-mode.
- schedules support recurring prompts with pause/resume/run-now/delete controls.
- MCP server registry supports register/start/stop/remove lifecycle for local MCP processes.
- relay sessions provide HTTP polling fallback transport.
- voice sessions provide text-backed turn capture with optional forward-to-agent.

## Portability

The entire MVP is self-contained under this folder and does not import from `../packages/*`.

## Windows installer

```bash
cd mvp
npm run desktop:installer
```

Output: `apps/desktop/dist`.
