# MVP Daemon

## API

- `GET /health`
- `POST /pairing/offer`
- `POST /pairing/redeem`
- `GET /agents`
- `GET /agents/:agentId/events?limit=300`

## WebSocket

- Endpoint: `/ws`
- First message must be:

```json
{
  "type": "hello",
  "payload": {
    "authToken": "..."
  }
}
```

- Server responses/events:
  - `welcome`
  - `agent_update`
  - `agent_stream`
  - `error`

## Supported client commands

- `agent_create`
- `agent_send`
- `agent_stop`
- `agent_archive`

## Provider commands

The daemon shells out to:

- `MVP_PROVIDER_CODEX_CMD` (default `codex`)
- `MVP_PROVIDER_CLAUDE_CMD` (default `claude`)
- `MVP_PROVIDER_OPENCODE_CMD` (default `opencode`)

These commands must be available on `PATH` of the daemon process.
