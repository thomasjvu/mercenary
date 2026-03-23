# Hackathon

Boss Raid is the Synthesis demo surface for Mercenary.

## One-Line Story

Boss Raid lets a developer or another agent submit one task through `POST /v1/raid`, MCP, or the OpenAI-compatible chat surface; Mercenary breaks it into scoped workstreams, routes the right HTTP providers, verifies the outputs, returns one canonical result, and publishes proof.

## Review Links

- live demo: `https://bossraid-web.pages.dev/`
- native route: `POST /v1/raid`
- public receipt: `/receipt`
- manifest: `GET /v1/agent.json`
- run log: `GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>`
- optional attestation: `GET /v1/attested-runtime` and `GET /v1/raid/:raidId/attested-result`

## Track Fit

| Track | What Boss Raid shows | Main proof in repo | Current truth |
| --- | --- | --- | --- |
| Synthesis Open Track | One request becomes one managed multi-agent raid with one result and one proof surface. | `POST /v1/raid`, `/receipt`, `GET /v1/agent.json`, `GET /v1/raids/:raidId/agent_log.json?token=...` | Strong now. |
| Venice | Strict-private routing prefers Venice-backed providers and keeps the privacy decision visible in routing proof. | `examples/strict-private-raid.json`, `pnpm test:strict-private:e2e` | Strong now when Venice-backed providers are configured. |
| Base Agent Services | Boss Raid is an agent service with public HTTP ingress, discovery, and x402 payment gating. | `POST /v1/raid`, `POST /v1/chat/completions`, x402 routes, Base-oriented settlement env in repo | Strong now for service shape; stronger with live paid traffic. |
| Protocol Labs: Let the Agent Cook | Mercenary runs the discover, plan, route, verify, synthesize, and settle loop with public manifest and run log proof. | `GET /v1/agent.json`, `GET /v1/raids/:raidId/agent_log.json?token=...`, MCP tool flow | Strong now. |
| Protocol Labs: Agents With Receipts | Boss Raid can surface ERC-8004 identity refs, trust-gated routing, receipt proof, and DevSpot-style manifest plus run log. | provider `erc8004` metadata, `requireErc8004`, `minTrustScore`, receipt, `agent.json`, `agent_log.json` | Good architecture now. Final sponsor-grade proof still needs real live ERC-8004 tx refs. |
| Virtuals ERC-8183 Open Build | Boss Raid exposes ERC-8183-aligned settlement data and a concrete ACP-to-Boss-Raid mapping for provider identity and address wiring. | settlement proof surfaces, `examples/provider-registration.base-mainnet.example.json`, `examples/virtuals-acp-capture-sheet.md` | Good architecture now. Final sponsor-grade proof still needs live onchain settlement txs. |
| EigenCloud | Boss Raid can run in one EigenCompute TEE container and expose attested runtime and attested result proof. | `Dockerfile.eigencompute`, `scripts/serve-eigencompute.mjs`, attestation routes | Strong architecture now; strongest with a live deployed enclave. |

## Cohesive Demo Flow

1. Start at `/demo` or `POST /v1/raid`.
2. Show that Mercenary turns one task into scoped workstreams and routes real HTTP providers.
3. Open `/receipt` to show one canonical result, routing proof, and settlement proof.
4. Open `GET /v1/agent.json` to show Mercenary's manifest.
5. Open `GET /v1/raids/:raidId/agent_log.json?token=...` to show the autonomous run log.
6. If the lane is Venice, show `venicePrivateLane=true` and the Venice-backed routed providers.
7. If the lane is EigenCloud, show attested runtime and attested result.
8. If the lane is Protocol Labs or Virtuals, show ERC-8004 fields and ERC-8183-aligned settlement fields, then be explicit about whether the run is file-mode rehearsal or live onchain proof.

## What We Can Claim Honestly

- Mercenary already exposes a coherent multi-agent execution story through the native raid route, MCP, and the OpenAI-compatible path.
- Boss Raid already exposes a coherent proof story through the receipt, manifest, and per-raid run log.
- Strict-private Venice routing is already represented in the request model, routing proof, and public proof surfaces.
- ERC-8004 identity and trust fields are already load-bearing in provider metadata and routing filters.
- ERC-8183-aligned settlement data is already load-bearing in result and receipt payloads.
- The repo does not mint ERC-8004 registrations onchain by itself today.
- The strongest Protocol Labs and Virtuals lane still requires real external ERC-8004 registration refs plus live onchain settlement txs.

## Demo Assets In Repo

- hero cover image: `assets/hero.png`
- screenshot image: `assets/cover.png`
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
