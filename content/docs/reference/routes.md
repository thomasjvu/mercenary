# Routes

Native write route: `POST /v1/raid`.

## Public write

| Route                                           | Purpose                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/raid`                                 | Native raid (`raid_request` shape). Returns `raidId`, `raidAccessToken`, `receiptPath`. Requires wallet session cookie, buyer API key (`Authorization: Bearer br_…`), or mana billing headers unless admin bearer bypasses payment. x402 when enabled.                                                  |
| `POST /v1/chat/completions`                     | OpenAI-compatible Mercenary entry (`model: mercenary-v1`). Planner decides direct reply vs specialist raid. Optional `stream`, `raid_policy.max_total_cost`, `raid_request`. Same session/API-key/mana gate as `POST /v1/raid`. x402 when enabled; admin bearer bypasses payment for internal launches. |
| `POST /v1/inference/chat/completions`           | Discount inference. One seller, `cost_first`, rate-card snapshot. Same session/API-key/mana gate as Mercenary routes. Strict E2EE catalog models use the server Venice relay when `raid_policy.privacy_mode` is `strict`; pass `X-BossRaid-Upstream-Api-Key` or configure `BOSSRAID_VENICE_API_KEY`.    |
| `POST /v1/auth/agent-session`                   | Store ERC-7715 permission context for MCP redelegated x402 payments. Requires wallet session cookie.                                                                                                                                                                                                    |
| `GET /v1/auth/agent-session`                    | Read stored agent payment session for the signed-in wallet.                                                                                                                                                                                                                                             |
| `DELETE /v1/auth/agent-session`                 | Clear stored agent payment session.                                                                                                                                                                                                                                                                     |
| `GET /v1/relayer/capabilities/:chainId`         | 1Shot relayer chain capabilities.                                                                                                                                                                                                                                                                       |
| `POST /v1/relayer/fee-data`                     | Gas/fee quote for ERC-7710 relay (`chainId`, `token`).                                                                                                                                                                                                                                                  |
| `POST /v1/relayer/estimate`                     | Estimate ERC-7710 relay bundle before send.                                                                                                                                                                                                                                                             |
| `POST /v1/relayer/send`                         | Proxy `relayer_send7710Transaction` to the public 1Shot relayer.                                                                                                                                                                                                                                        |
| `GET /v1/relayer/status/:taskId`                | Poll 1Shot relay task status.                                                                                                                                                                                                                                                                           |
| `POST /v1/relayer/webhook`                      | 1Shot relayer status webhook sink. Requires `X-BossRaid-Relayer-Webhook-Secret` (or `Authorization: Bearer`) matching `BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET` in production.                                                                                                                          |
| `POST /v1/bounties`                             | Create bounty draft (wallet session).                                                                                                                                                                                                                                                                   |
| `POST /v1/bounties/:id/fund`                    | Fund escrow and open bounty board (x402 USDC in production; onchain `BossBountyEscrow` when `BOSSRAID_SETTLEMENT_MODE=onchain`).                                                                                                                                                                        |
| `POST /v1/bounties/:id/refund`                  | Poster refunds unawarded escrow after bidding deadline (wallet session).                                                                                                                                                                                                                                |
| `GET /v1/bounties`                              | Public bounty board (`?status=open`).                                                                                                                                                                                                                                                                   |
| `GET /v1/bounties/:id`                          | Bounty detail, bids, awards.                                                                                                                                                                                                                                                                            |
| `POST /v1/bounties/:id/bids`                    | Provider bid (provider auth).                                                                                                                                                                                                                                                                           |
| `POST /v1/bounties/:id/award`                   | Poster awards one or more bids.                                                                                                                                                                                                                                                                         |
| `POST /v1/bounties/:id/raids`                   | Spawn linked Mercenary raid for an award.                                                                                                                                                                                                                                                               |
| `POST /v1/bounties/:id/awards/:awardId/deliver` | Provider delivery + hash proof.                                                                                                                                                                                                                                                                         |
| `POST /v1/bounties/:id/awards/:awardId/accept`  | Poster accepts and releases escrow.                                                                                                                                                                                                                                                                     |
| `POST /v1/bounties/:id/awards/:awardId/claim`   | Permissionless payout after accept deadline.                                                                                                                                                                                                                                                            |

`receiptPath` → `/verification?raidId=...&token=...`

## Status, proof, discovery

| Route                                      | Auth                          | Purpose                                        |
| ------------------------------------------ | ----------------------------- | ---------------------------------------------- |
| `GET /health`                              | —                             | Health + ready providers                       |
| `GET /ready`                               | —                             | Public beta readiness (`{ ok: boolean }` only) |
| `GET /metrics`                             | admin\*                       | Prometheus metrics                             |
| `GET /v1/raid/:raidId`                     | raid token / admin            | Status                                         |
| `GET /v1/raid/:raidId/result`              | raid token / admin            | Result + routing + settlement                  |
| `GET /v1/raid/:raidId/provider-settlement` | raid token / provider / admin | Per-provider settlement slice (`?providerId=`) |
| `GET /v1/raid/:raidId/agent_log.json`      | query `token`                 | Run log                                        |

| `GET /v1/agent.json` | — | Mercenary manifest |
| `GET /v1/host/attestation` | — | Public host TEE proof (Phala quote when `BOSSRAID_TEE_PLATFORM=phala`; optional `signedRuntime` when `MNEMONIC` is set) |
| `GET /v1/attested-runtime` | admin | Signed runtime attestation (`MNEMONIC`) |
| `GET /v1/raid/:raidId/attested-result` | raid token | Signed result |
| `GET /v1/providers` | — | Provider list (`?sourceType=party_quest`, `?supportedFramework=party-quest`) |
| `GET /v1/providers/health` | — | Readiness snapshot |
| `GET /v1/providers/:providerId/stats` | admin | Provider profile + endpoint (ops/MCP) |
| `GET /v1/models` | — | Model catalog + filters |
| `GET /v1/prices` | — | Compact pricing |
| `GET /v1/markets` | — | Order book by model |
| `GET /agents/discover` | — | Provider discovery |

\* `BOSSRAID_METRICS_PUBLIC=true` exposes `/metrics` without admin auth.

## Provider callbacks & registry

| Route                              | Auth           | Purpose            |
| ---------------------------------- | -------------- | ------------------ |
| `POST /v1/providers/:id/heartbeat` | provider       | Liveness           |
| `POST /v1/providers/:id/submit`    | provider       | Submission         |
| `POST /v1/providers/:id/failure`   | provider       | Failure            |
| `POST /agents/register`            | registry token | Register provider  |
| `POST /agents/:id/verify`          | registry token | Verification probe |
| `POST /agents/heartbeat`           | registry token | Registry heartbeat |

Output types: `text`, `patch`, `json`, `image`, `video`, `bundle`.

## Hosted inference gateway

Public base: `BOSSRAID_INFERENCE_GATEWAY_BASE` (default API origin). Orchestrator dispatches hosted sellers here instead of direct worker callbacks.

| Route                                      | Auth     | Purpose                                      |
| ------------------------------------------ | -------- | -------------------------------------------- |
| `GET /gateway/:providerId/health`          | —        | Hosted seller readiness + upstream config    |
| `POST /gateway/:providerId/v1/raid/accept` | provider | Accept raid task package; runs inference job |

Provider auth: `Authorization`, `X-BossRaid-Provider-Id`, `X-BossRaid-Timestamp`, `X-BossRaid-Signature`.

## Public beta accounts

| Route                                                  | Purpose                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `POST /v1/auth/nonce`                                  | Wallet nonce                                                                                 |
| `POST /v1/auth/verify`                                 | Wallet session                                                                               |
| `GET/DELETE /v1/session`                               | Session read/clear                                                                           |
| `GET/POST /v1/buyer/api-keys`                          | List/create buyer `br_` keys                                                                 |
| `PATCH /v1/buyer/api-keys/:keyId`                      | Update buyer API key spend limit (`spendLimitUsd`, min $1)                                   |
| `DELETE /v1/buyer/api-keys/:keyId`                     | Revoke buyer API key                                                                         |
| `GET/POST/PATCH /v1/seller/providers`                  | Seller CRUD                                                                                  |
| `POST /v1/seller/providers/:id/verify`                 | Re-verify                                                                                    |
| `POST /v1/seller/upstream/:provider/connect`           | Validate + store upstream API key (`venice`, `redpill`, `near`, `chutes`, `phala`)           |
| `GET /v1/seller/upstream/:provider/config`             | Upstream connection status                                                                   |
| `GET /v1/seller/upstream/:provider/models/catalog`     | Boss Raid catalog for provider (no upstream API key; includes reference token rates)         |
| `GET /v1/seller/upstream/:provider/models`             | Merged catalog for seller (requires connected upstream key)                                  |
| `POST /v1/seller/upstream/:provider/offers`            | Publish hosted model offers                                                                  |
| `DELETE /v1/seller/upstream/:provider/offers/:modelId` | Pause hosted offer                                                                           |
| `GET /v1/seller/upstream/status`                       | All connected upstream providers for seller                                                  |
| `POST /v1/marketplace/tee/attestation`                 | Fetch + verify upstream TEE attestation for model                                            |
| `POST /v1/marketplace/tee/attestation/preflight`       | Validate upstream API key + TEE attestation before connect (`provider`, `modelId`, `apiKey`) |
| `GET /v1/marketplace/models/:modelId/tee`              | Catalog TEE summary + cached attestation                                                     |
| `GET /v1/seller/earnings`                              | Payout ledger                                                                                |
| `GET /v1/seller/stats`                                 | Dashboard metrics + per-model Boss Raid routed volume (`modelDemand`)                        |
| `GET /v1/buyer/purchases`                              | Purchase history                                                                             |
| `GET /v1/buyer/balance`                                | Prepaid balance read                                                                         |
| `POST /v1/buyer/balance/fund`                          | Credit prepaid balance (session wallet; verified x402 required in production)                |
| `GET /v1/marketplace/stats`                            | Public counters                                                                              |

Buyer API keys on paid routes skip x402 and debit spend caps.

## Inference attestation receipts

| Route                                          | Auth | Purpose                                   |
| ---------------------------------------------- | ---- | ----------------------------------------- |
| `GET /v1/inference/receipts/:receiptId`        | —    | Stored inference attestation receipt      |
| `GET /v1/inference/receipts/:receiptId/verify` | —    | Receipt verification summary + TEE checks |

Strict E2EE inference responses include `privacy.receiptId` pointing at these routes.

## Admin & ops

| Route                                 | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| `GET /v1/runtime`                     | Diagnostics                                        |
| `POST /v1/runtime/evaluator-smoke`    | Admin evaluator probe (requires runtime execution) |
| `GET /v1/raids`                       | Raid list                                          |
| `POST /v1/raid/:raidId/abort`         | Abort                                              |
| `POST /v1/evaluations/:raidId/replay` | Replay eval                                        |
| `GET /v1/ops/metrics`                 | JSON metrics (counters + route latency)            |
| `GET /v1/ops/production-readiness`    | Launch checklist (pass/warn/fail checks)           |
| `GET/POST/DELETE /v1/ops/session`     | Ops session                                        |
| `GET/PATCH /v1/ops/settings`          | x402 toggle + facilitator/pay-to blockers          |
| `GET /v1/ops/settlement/status`       | Settlement mode, chain, contract health            |

Admin: `Authorization: Bearer $BOSSRAID_ADMIN_TOKEN` or ops session cookie.

## Web & gateway

<!-- docs:template:web-routes -->

| Path                                                                 | Purpose                                        |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `/mercenary`                                                         | Mercenary chat and raid launcher               |
| `/marketplace`                                                       | Model marketplace                              |
| `/playground`                                                        | Inference playground and raid mode             |
| `/onboarding/buyer`, `/onboarding/seller`, `/onboarding/seller/http` | Buyer and seller onboarding                    |
| `/sell/offers`                                                       | Seller offer management                        |
| `/account`                                                           | Keys, sellers, balance                         |
| `/raiders`                                                           | Provider directory                             |
| `/verification`                                                      | Public proof (`/receipt` redirects here)       |
| /changelog, `/changelog/:version`                                    | Product changelog (index shows latest release) |
| `/legal, /terms-of-service, /privacy-policy, /acceptable-use-policy` | Legal policies                                 |
| `/ops/`                                                              | Ops SPA (readiness, settlement, metrics, x402) |
| `/api/*`, `/ops-api/*`                                               | Proxied API                                    |

<!-- /docs:template:web-routes -->

## MCP tools

`bossraid_spawn`, `bossraid_status`, `bossraid_result`, `bossraid_receipt`, `bossraid_delegate`, `bossraid_abort`, `bossraid_replay`, `bossraid_capabilities`, `bossraid_provider_stats`

## Footnotes

- Chat route: low-signal greetings may return without opening a raid. `stream=true` → SSE chunks.
- Inference route: no small-talk bypass; defaults budget to cheapest seller when omitted.
- Onchain settlement: result/attested-result reads may refresh contract state before respond.
- Registration fields `verification`, `privacy`, `erc8004`, `trust`, `reputation` stay separate.
