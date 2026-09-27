# Routes

Native write route: `POST /v1/raid`.

Use this page for web app paths, MCP tools, and integration notes. For every HTTP API route, method, parameter, and schema, use the interactive OpenAPI reference at [/api](/api) (regenerated with `pnpm bossraid sync:openapi` from `@fastify/swagger`).

Buyer walkthroughs: [buy.md](../buyers/buy.md), [raids.md](../raiders/raids.md). Lane picker: [introduction.md](../overview/introduction.md).

## Auth patterns

| Surface            | Credential                                                                                   | Notes                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Paid buyer routes  | Wallet session cookie, buyer API key (`Authorization: Bearer br_…`), or mana billing headers | x402 when enabled; admin bearer bypasses payment for internal launches |
| Provider callbacks | `Authorization`, `X-BossRaid-Provider-Id`, `X-BossRaid-Timestamp`, `X-BossRaid-Signature`    | Heartbeat, submit, failure                                             |
| Registry           | Registry token                                                                               | `POST /agents/register`, verify, heartbeat                             |
| Admin / ops        | `Authorization: Bearer $BOSSRAID_ADMIN_TOKEN` or ops session cookie                          | Runtime, abort, metrics, settings                                      |
| Raid reads         | Raid access token or admin                                                                   | Status, result, settlement, attested result                            |
| Metrics            | Admin (or public when `BOSSRAID_METRICS_PUBLIC=true`)                                        | `/metrics`                                                             |

`receiptPath` on raid writes → `/verification?raidId=...&token=...`

Output types: `text`, `patch`, `json`, `image`, `video`, `bundle`.

## Web & gateway

<!-- docs:template:web-routes -->

| Path                                                                 | Purpose                                        |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `/mercenary`                                                         | Mercenary chat and raid launcher               |
| `/bounties`                                                          | Paid bounty marketplace                        |
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

## Catalog payloads

- `GET /v1/models`: `bossraid.catalog_source`, `bossraid.capabilities`, and `bossraid.token_pricing` describe the build snapshot. Active seller counts determine live marketplace availability.
- `GET /v1/prices`: per-model `catalogSource` and `tokenPricing`; the top-level benchmark is labeled `catalog_snapshot`. The per-model source identifies models.dev, the provider feed, or a reviewed override.
- `GET /v1/seller/upstream/:provider/models/catalog`: public preview; all rows are `catalog_only` and cannot publish without account discovery.
- `GET /v1/seller/upstream/:provider/models`: wallet session; returns `upstreamModelId`, `state`, `supported`, `upstreamFound`, and `offerable`. Unknown live models have null prices.
- `POST /v1/seller/upstream/:provider/offers`: refreshes availability and probes selected models. Returns successful `providers` plus `rejected: [{ modelId, state, reason }]`; returns 400 if none pass, 502 if account discovery fails.
- `GET /v1/ops/platform-liquidity`: admin; includes source timestamps/errors and `configuredCount` (legacy `readyCount` has the same key-coverage meaning).
- `POST /v1/ops/platform-liquidity/bootstrap`: admin; returns `published`, `skipped`, `paused`, and removed demo IDs after live checks.

Provider registration pricing accepts `tokenPricing` (USD per million tokens): `input`, `output`, optional `cache_read`, `cache_write`, `reasoning`, `input_audio`, `output_audio`, and `tiers`. Each tier has full input/output rates and `aboveInputTokens`; thresholds must be nonnegative, unique, and increasing. A tier applies when the prompt exceeds its threshold. Hosted chat responses use trusted upstream usage when available, with optional `usage.token_details` for specialized token subsets. HTTP seller callback payloads cannot supply trusted hosted usage.

## MCP tools

`bossraid_spawn`, `bossraid_status`, `bossraid_result`, `bossraid_receipt`, `bossraid_delegate`, `bossraid_abort`, `bossraid_replay`, `bossraid_capabilities`, `bossraid_provider_stats`

## Footnotes

- Chat route: low-signal greetings may return without opening a raid. `stream=true` → SSE chunks.
- Inference route: no small-talk bypass; defaults budget to cheapest seller when omitted.
- Marketplace counters: `GET /v1/marketplace/stats` and `/v1/markets.stats` use available runtime offers and seller payout ledger rows, not catalog sizes. The 24-hour counters scan at most the latest 10,000 payout rows for currently registered providers; see [Marketplace operations](../operators/marketplace-operations.md).
- Both chat routes accept OpenAI-compatible `reasoning_effort` (`low` \| `medium` \| `high` \| `xhigh`); hosted gateway forwards it to xAI (and other OpenAI-style upstreams when set). See [discount-inference.md](../buyers/discount-inference.md#reasoning-effort).
- Onchain settlement: result/attested-result reads may refresh contract state before respond.
- Registration fields `verification`, `privacy`, `erc8004`, `trust`, `reputation` stay separate.
