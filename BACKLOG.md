# MVP Backlog

## Completed in this implementation

- [x] Standalone workspace under `mvp` with no parent-package imports
- [x] Daemon HTTP and WebSocket runtime
- [x] Pairing offer and redeem token flow
- [x] Provider registry with `codex`, `claude`, `opencode`
- [x] SQLite persistence for agents and events
- [x] Event retention compaction with summary events
- [x] Expo client with Pair, Agents, Agent Detail screens
- [x] PWA manifest and service worker files
- [x] Daemon unit/integration-level tests for db/registry/agent manager

## Remaining high-value tasks

- [ ] Add on-device QR scanning component in client (currently paste-based pairing input)
- [ ] Add auth protection for `GET /agents` and `GET /agents/:id/events`
- [ ] Add daemon process metrics and basic observability endpoint
- [ ] Add integration test with spawned mock CLI provider process
- [ ] Add release packaging scripts for moving `mvp` into its own repository

## Smoke checklist

1. Start daemon and request `/pairing/offer`.
2. Pair from Expo app using offer payload.
3. Create agent with `codex`, `claude`, and `opencode`.
4. Send follow-up and confirm stream append.
5. Stop and archive agent.
6. Restart daemon and validate persisted timeline.
