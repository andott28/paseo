# MVP Client

Expo app targeting:

- iOS/Android (dev client / iLoader workflows)
- Web PWA (`expo start --web`)

## Screens

- Pair screen
- Agents list
- Agent detail stream

## Pairing

1. Get offer from daemon `POST /pairing/offer`
2. Paste URL fragment (`offer=...`) in Pair screen
3. Client redeems with `POST /pairing/redeem`
4. Client opens WebSocket and sends `hello`
