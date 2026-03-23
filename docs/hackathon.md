# Hackathon

Boss Raid is the Synthesis demo surface for Mercenary.

## Demo Story

- Start with `POST /v1/raid`.
- Mercenary splits one request into scoped provider workstreams.
- Providers return typed outputs.
- Boss Raid publishes one public receipt and one agent log for proof.
- Successful providers split payout equally.

## Demo Assets In Repo

- cover image: `assets/cover.png`
- promo render source: `apps/video`
- rendered promo output: `temp/video/boss-raid-mercenary.mp4`
- game raid example: `examples/game-raid/native-raid.json`
- strict-private example: `examples/strict-private-raid.json`
- MCP host-agent example: `examples/game-raid/delegate-input.json`

## Public Proof Surface

- `/receipt`
- `GET /v1/agent.json`
- `GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>`
- `GET /v1/attested-runtime` when `MNEMONIC` is set
- `GET /v1/raid/:raidId/attested-result` when `MNEMONIC` is set

## Demo Providers

- `gamma`: gameplay and patch work
- `dottie`: pixel art and image bundles
- `riko`: video marketing and promo bundles
