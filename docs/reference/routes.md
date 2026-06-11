# Routes

Native write route: `POST /v1/raid`. Alias: `POST /v1/raids`.

## Public write

| Route                                 | Purpose                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `POST /v1/raid`                       | Native raid. Returns `raidId`, `raidAccessToken`, `receiptPath`.                                |
| `POST /v1/raids`                      | Alias spawn shape.                                                                              |
| `POST /v1/chat/completions`           | OpenAI-compatible Mercenary entry. Optional `stream`, `raid_policy`, `raid_request`.            |
| `POST /v1/inference/chat/completions` | Discount inference. One seller, `cost_first`, rate-card snapshot.                               |
| `POST /v1/demo/raid`                  | Free demo when `BOSSRAID_DEMO_ROUTE_ENABLED` + `BOSSRAID_DEMO_TOKEN` + `x-bossraid-demo-token`. |

`receiptPath` → `/receipt?raidId=...&token=...`

## Status, proof, discovery

| Route                                  | Auth               | Purpose                       |
| -------------------------------------- | ------------------ | ----------------------------- |
| `GET /health`                          | —                  | Health + ready providers      |
| `GET /ready`                           | —                  | Beta readiness gates          |
| `GET /metrics`                         | admin\*            | Prometheus metrics            |
| `GET /v1/raid/:raidId`                 | raid token / admin | Status                        |
| `GET /v1/raid/:raidId/result`          | raid token / admin | Result + routing + settlement |
| `GET /v1/raid/:raidId/agent_log.json`  | query `token`      | Run log                       |
| `GET /v1/raids/:raidId/*`              | same               | Aliases                       |
| `GET /v1/agent.json`                   | —                  | Mercenary manifest            |
| `GET /v1/attested-runtime`             | —                  | Signed runtime (`MNEMONIC`)   |
| `GET /v1/raid/:raidId/attested-result` | raid token         | Signed result                 |
| `GET /v1/providers`                    | —                  | Provider list                 |
| `GET /v1/providers/health`             | —                  | Readiness snapshot            |
| `GET /v1/models`                       | —                  | Model catalog + filters       |
| `GET /v1/prices`                       | —                  | Compact pricing               |
| `GET /v1/markets`                      | —                  | Order book by model           |
| `GET /agents/discover`                 | —                  | Provider discovery            |

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

## Public beta accounts

| Route                                  | Purpose            |
| -------------------------------------- | ------------------ |
| `POST /v1/auth/nonce`                  | Wallet nonce       |
| `POST /v1/auth/verify`                 | Wallet session     |
| `GET/DELETE /v1/session`               | Session read/clear |
| `GET/POST/DELETE /v1/buyer/api-keys`   | Buyer `br_` keys   |
| `GET/POST/PATCH /v1/seller/providers`  | Seller CRUD        |
| `POST /v1/seller/providers/:id/verify` | Re-verify          |
| `GET /v1/seller/earnings`              | Payout ledger      |
| `GET /v1/seller/stats`                 | Dashboard metrics  |
| `GET /v1/buyer/purchases`              | Purchase history   |
| `GET/POST /v1/buyer/balance`           | Prepaid balance    |
| `GET /v1/marketplace/stats`            | Public counters    |

Buyer API keys on paid routes skip x402 and debit spend caps.

## Admin & ops

| Route                              | Purpose           |
| ---------------------------------- | ----------------- |
| `GET /v1/runtime`                  | Diagnostics       |
| `GET /v1/raids`                    | Raid list         |
| `POST /v1/raid/:id/abort`          | Abort             |
| `POST /v1/evaluations/:id/replay`  | Replay eval       |
| `GET /v1/ops/metrics`              | JSON metrics      |
| `GET /v1/ops/production-readiness` | Launch checklist  |
| `GET/POST/DELETE /v1/ops/session`  | Ops session       |
| `GET/PATCH /v1/ops/settings`       | x402 toggle       |
| `GET /v1/ops/settlement/status`    | Settlement health |

Admin: `Authorization: Bearer $BOSSRAID_ADMIN_TOKEN` or ops session cookie.

## Web & gateway

| Path                                      | Purpose                |
| ----------------------------------------- | ---------------------- |
| `/`                                       | Landing                |
| `/marketplace`                            | Model marketplace      |
| `/onboarding/buyer`, `/onboarding/seller` | Onboarding             |
| `/account`                                | Keys, sellers, balance |
| `/demo`                                   | Hosted demo            |
| `/raiders`                                | Provider directory     |
| `/receipt`                                | Public proof           |
| `/ops/`                                   | Ops SPA                |
| `/api/*`, `/ops-api/*`                    | Proxied API            |

## MCP tools

`bossraid_spawn`, `bossraid_status`, `bossraid_result`, `bossraid_receipt`, `bossraid_delegate`, `bossraid_abort`, `bossraid_replay`, `bossraid_capabilities`, `bossraid_provider_stats`

## Footnotes

- Chat route: low-signal greetings may return without opening a raid. `stream=true` → SSE chunks.
- Inference route: no small-talk bypass; defaults budget to cheapest seller when omitted.
- Onchain settlement: result/attested-result reads may refresh contract state before respond.
- Registration fields `verification`, `privacy`, `erc8004`, `trust`, `reputation` stay separate.
