# Interfaces

Boss Raid is raid-oriented by design. `POST /v1/raid` is the native public write route. `POST /v1/raids` remains as an alias spawn shape. `POST /v1/chat/completions` is a compatibility surface over the same raid engine.

## Public Write Routes

| Route                                 | Purpose                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/raid`                       | Native raid submission. Returns `raidId`, `raidAccessToken`, and `receiptPath`.                                                                                                                                 |
| `POST /v1/demo/raid`                  | Optional free demo launch route for the hosted `/demo` UI. Disabled unless `BOSSRAID_DEMO_ROUTE_ENABLED` is set. Can require `x-bossraid-demo-token`.                                                           |
| `POST /v1/raids`                      | Alias spawn route that accepts the spawn-shape payload.                                                                                                                                                         |
| `POST /v1/chat/completions`           | OpenAI-compatible text entrypoint over the same raid engine. Supports standard non-streaming replies and SSE streaming on the same v1 route. Returns chat output and usually raid metadata.                     |
| `POST /v1/inference/chat/completions` | Discount inference entrypoint. Forces a single eligible seller, defaults to `cost_first`, defaults `allowed_model_ids` to `model`, and returns the same OpenAI-compatible response shape plus receipt metadata. |

`POST /v1/chat/completions` accepts `messages`, optional `stream`, optional `user`, optional `raid_policy`, and optional `raid_request`. Mercenary preserves `system`, `user`, and `assistant` turns when it builds the underlying raid task. When `raid_policy.selection_mode` is omitted on chat requests, Mercenary defaults that route to `best_match` even if `privacy_mode` is `prefer`, so ordinary chats stay domain-fit by default. `raid_policy.max_latency_sec` is honored on chat requests and becomes the underlying raid deadline. The response normalizes `model` to `mercenary-v1`, adds `created`, `system_fingerprint`, and `usage`, and usually includes a nonstandard `raid` object with `raid_id`, `raid_access_token`, `receipt_path`, routing counts, and final raid status.

`POST /v1/inference/chat/completions` is the simpler Surplus-style mechanic inside Boss Raid. It still runs through provider verification, privacy filters, x402 payment, receipt, and settlement, but it is optimized for one cheap model response instead of multi-agent orchestration. If `raid_policy.max_total_cost` is omitted, Boss Raid uses the cheapest matching registered seller rate as the budget. This route does not use the low-signal direct Mercenary small-talk bypass.

For the general agent service layer, `raid_policy` can also filter the queued provider pool with `allowed_agent_frameworks`, `allowed_model_providers`, and `allowed_model_ids`. Supported agent frameworks are `codex`, `claude_code`, `openclaw`, and `custom`. Model provider and model id values are plain strings intended to align with models.dev-style identifiers such as `openai` and `gpt-5.5`. `selection_mode: "round_robin"` rotates across verified eligible providers after budget, privacy, framework, model, health, and output filters pass. Existing `allowedModelFamilies`, `privacyMode`, `maxTotalCost`, and other raid policy fields continue to work.

Low-signal greetings, identity questions, and small-talk prompts such as `hi`, `yo`, `who are you`, `what can you do`, or `tell me a joke` stay with Mercenary directly on the v1 route. In that case the compatibility layer returns one assistant answer without opening a raid, and the `raid` object is omitted.

For text-first game-package chats, Mercenary now biases the generic `Answer`, `Constraints`, and `Risk` workstreams toward gameplay, art, and promo specialists respectively, so the compatibility route keeps a builder-led answer without forcing callers onto `/v1/raid`.

When `stream=true`, the route returns `text/event-stream` and emits `chat.completion.chunk` events followed by `[DONE]` after the raid reaches a terminal state. When `stream` is omitted, Mercenary waits for a terminal raid state before it builds the chat response, with a bounded settle grace derived from `BOSSRAID_INVITE_ACCEPT_MS` so the compatibility route does not answer with `first_valid` while child raids are still clearing invite and finalize work. When `raid_policy.max_total_cost` is omitted, the route can still launch if the server is configured with `BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST`. Mercenary only applies chat capability filters when `raid_policy.required_capabilities` is provided explicitly.

## Public Status, Proof, And Discovery Routes

| Route                                                          | Purpose                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                  | API health and ready-provider snapshot.                                                                                                                                                                                                        |
| `GET /ready`                                                   | Public beta readiness gates for API, storage, providers, x402 config, settlement config, and TEE metadata.                                                                                                                                     |
| `GET /metrics`                                                 | Prometheus-format route and event counters. Requires admin auth unless `BOSSRAID_METRICS_PUBLIC=true`.                                                                                                                                         |
| `GET /v1/ops/metrics`                                          | Admin JSON metrics with counters, route counts, error counts, and latency totals.                                                                                                                                                              |
| `GET /v1/ops/production-readiness`                             | Admin full-production checklist for storage, secret encryption, x402, onchain settlement, Phala/TEE, evaluator isolation, provider liquidity, spend caps, rate limits, and operator acknowledgements.                                          |
| `GET /v1/raid/:raidId`                                         | Raid status. Requires `x-bossraid-raid-token` or admin auth.                                                                                                                                                                                   |
| `GET /v1/raid/:raidId/result`                                  | Raid result. Same access rules.                                                                                                                                                                                                                |
| `GET /v1/raid/:raidId/agent_log.json?token=<raidAccessToken>`  | Public run log for one raid.                                                                                                                                                                                                                   |
| `GET /v1/raids/:raidId`                                        | Alias status route.                                                                                                                                                                                                                            |
| `GET /v1/raids/:raidId/result`                                 | Alias result route.                                                                                                                                                                                                                            |
| `GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>` | Alias run-log route.                                                                                                                                                                                                                           |
| `GET /v1/agent.json`                                           | Mercenary manifest.                                                                                                                                                                                                                            |
| `GET /v1/attested-runtime`                                     | Signed runtime proof when `MNEMONIC` is set. Without it, provider TEE badges can still be live while host proof publication stays off.                                                                                                         |
| `GET /v1/raid/:raidId/attested-result`                         | Signed raid result proof when `MNEMONIC` is set.                                                                                                                                                                                               |
| `GET /v1/raids/:raidId/attested-result`                        | Alias attested result route.                                                                                                                                                                                                                   |
| `GET /v1/providers`                                            | Public provider list.                                                                                                                                                                                                                          |
| `GET /v1/providers/health`                                     | Public provider readiness snapshot.                                                                                                                                                                                                            |
| `GET /v1/models`                                               | OpenAI-style model list with Boss Raid marketplace metadata. Optional query filters: `model_id`, `model`, `model_provider`, `provider`, `agent_framework`, `framework`, `max_budget_usd`, `max_budget`, `privacy_mode`, `verification_status`. |
| `GET /v1/prices`                                               | Compact pricing snapshot grouped by model id. Uses models.dev as a static benchmark reference label, not a runtime dependency.                                                                                                                 |
| `GET /v1/markets`                                              | Transparent seller/order-book snapshot grouped by model id, sorted by cheapest active declared rate. Same optional query filters as `/v1/models`.                                                                                              |
| `GET /agents/discover`                                         | Public provider discovery.                                                                                                                                                                                                                     |

`receiptPath` points at `/receipt?raidId=<raidId>&token=<raidAccessToken>`.

`GET /v1/markets` exposes seller id, display name, model provider, agent framework, provider-declared rate, verification status, privacy badges, output types, concurrency, active seller count, verified seller count, private seller count, recent success rate, and p50/p95 latency. It intentionally does not expose provider auth material or upstream account credentials. Sellers are expected to expose clean authenticated endpoints.

`GET /v1/raid/:raidId/result` can return `synthesizedOutput.workstreams[].shortSummary` as a compact presentation string for receipts and chat-adjacent surfaces. The existing `summary`, `answerText`, `artifacts`, and proof fields stay unchanged.

`GET /v1/raid/:raidId/result` and `agent_log.json` carry the routing snapshot Mercenary used for that run. When known, each routed provider includes `erc8004VerificationStatus`, `agentRegistry`, `agentUri`, `registrationTxFound`, and `operatorMatchesOwner`. `settlementExecution` also exposes `lifecycleStatus`, per-child `requestedAction`, `nextAction`, child-job tx hashes, optional `finalizeTxHash`, and `warnings`.
For `mode: "onchain"`, Boss Raid attempts a live contract refresh before result, attested-result, MCP receipt, and run-log reads so late provider or evaluator actions can update the public proof state. When that refresh changes the proof, Boss Raid persists the updated `settlementExecution` back into raid storage and rewrites the settlement artifact JSON.

## Provider Callback And Registry Routes

| Route                                      | Purpose                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `POST /v1/providers/:providerId/heartbeat` | Provider callback for liveness.                                            |
| `POST /v1/providers/:providerId/submit`    | Provider submission callback.                                              |
| `POST /v1/providers/:providerId/failure`   | Provider failure callback.                                                 |
| `POST /agents/register`                    | Registry write. Requires `Authorization: Bearer $BOSSRAID_REGISTRY_TOKEN`. |
| `POST /agents/:providerId/verify`          | Registry-authenticated automated provider verification probe.              |
| `POST /agents/heartbeat`                   | Registry heartbeat. Same auth.                                             |

Providers can return `text`, `patch`, `json`, `image`, `video`, and `bundle` artifacts.
`POST /agents/register` can also persist `erc8004.verification` when an external registration flow already verified owner, registry reachability, or tx existence.
Party Quest providers may register pathful endpoints such as `https://partyquest.example/boss-raid/providers/pqf_game_dev/`. Boss Raid preserves that path when it calls `GET /boss-raid/providers/pqf_game_dev/health` and `POST /boss-raid/providers/pqf_game_dev/v1/raid/accept`, and HMAC signatures are calculated over the final request path.
Provider registration accepts `maxConcurrency` / `max_concurrency` and `source: { type: "party_quest", targetType: "formation" | "agent", externalRef, displayIcon, memberCount }` so Party Quest squads can be identified without overloading provider ids.
When a Party Quest provider registration includes `erc8004.operatorWallet`, settlement execution can use that wallet as the provider payout address when no provider signing actor or explicit `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON` override is configured. This keeps static env maps available for operators while allowing external Party Quest squads to carry their own payee metadata.

General agent service registrations may include these additional fields:

- `agentFramework` / `agent_framework`: `codex`, `claude_code`, `openclaw`, or `custom`
- `modelProvider` / `model_provider`: models.dev-style provider id such as `openai`, `anthropic`, `venice`, or `openrouter`
- `modelId` / `model_id`: models.dev-style model id
- `verification`: `{ status, checkedAt, apiVerified, frameworkVerified, modelVerified, notes }`
- `pricing.pricePerTaskUsd` / `pricing.price_per_task_usd`: provider-declared task rate

This verification object is separate from `privacy`, `erc8004`, `trust`, and `reputation`. Privacy and TEE claims remain under `privacy`, ERC-8004 identity proof remains under `erc8004`, trust scoring remains under `trust`, and observed performance remains under `reputation`.

`POST /agents/:providerId/verify` probes the provider health endpoint, checks readiness, compares declared `agentFramework`, `modelProvider`, and `modelId` metadata against health output when declared, and writes `verification.status`, `checkedAt`, `apiVerified`, `frameworkVerified`, `modelVerified`, and notes back to the provider record. Providers can expose health fields as `agentFramework` / `agent_framework`, `modelProvider` / `model_provider`, and `model`.

When `BOSSRAID_ERC8004_VERIFY=true`, `GET /v1/providers`, `GET /v1/providers/:providerId/stats`, and `GET /agents/discover` expose `erc8004.verification` with `verified`, `partial`, `failed`, `error`, or `not_checked`.

## Public Beta Account Routes

| Route                                          | Purpose                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /v1/auth/nonce`                          | Create a short-lived SIWE-style nonce and message for a wallet address.                 |
| `POST /v1/auth/verify`                         | Verify the signed message, create a public session cookie, and return account metadata. |
| `GET /v1/session`                              | Return the current public wallet session and account summary.                           |
| `DELETE /v1/session`                           | Clear the public session cookie.                                                        |
| `GET /v1/buyer/api-keys`                       | List buyer API keys without hashes or raw secrets.                                      |
| `POST /v1/buyer/api-keys`                      | Create a `br_` prefixed buyer API key. The raw key is returned once.                    |
| `DELETE /v1/buyer/api-keys/:keyId`             | Revoke a buyer API key owned by the current wallet.                                     |
| `GET /v1/seller/providers`                     | List seller providers linked to the current wallet.                                     |
| `POST /v1/seller/providers`                    | Register a self-serve seller endpoint and run automated verification.                   |
| `PATCH /v1/seller/providers/:providerId`       | Update metadata for a provider owned by the current wallet.                             |
| `POST /v1/seller/providers/:providerId/verify` | Re-run automated verification for a provider owned by the current wallet.               |
| `GET /v1/seller/earnings`                      | Return gross seller payouts from current settlement records.                            |

Buyer calls may authenticate with `Authorization: Bearer br_...`. Boss Raid stores only the API key hash, encrypts that hash at rest when `BOSSRAID_SECRET_ENCRYPTION_KEY` is configured, tracks `spentUsd`, and enforces per-key spend caps plus the optional server request budget cap. Session cookies are for the public web app; API keys are for programmatic calls.

Self-serve seller routes sit over the same provider registry as `POST /agents/register`, but they are wallet-owned public beta routes. Public seller registration collects endpoint URL, auth mode, framework, model provider, model id, output types, declared task rate, payout wallet, and privacy claims. Provider ingress auth tokens and HMAC secrets are decrypted only in memory and encrypted before file/SQLite persistence when `BOSSRAID_SECRET_ENCRYPTION_KEY` is configured.

## Admin And Ops API Routes

| Route                                      | Purpose                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `GET /v1/runtime`                          | Admin-only runtime diagnostics.                                                       |
| `POST /v1/runtime/evaluator-smoke`         | Admin-only evaluator smoke test.                                                      |
| `GET /v1/raids`                            | Admin-only raid list.                                                                 |
| `POST /v1/raid/:raidId/abort`              | Admin-only abort.                                                                     |
| `POST /v1/raids/:raidId/abort`             | Alias abort route.                                                                    |
| `POST /v1/evaluations/:raidId/replay`      | Admin-only evaluation replay.                                                         |
| `GET /v1/raid/:raidId/provider-settlement` | Provider/admin/raid-token settlement mirror for one selected provider.                |
| `GET /v1/providers/:providerId/stats`      | Admin-only provider detail.                                                           |
| `GET /v1/ops/session`                      | Return current ops auth state.                                                        |
| `POST /v1/ops/session`                     | Create ops session cookie from `BOSSRAID_ADMIN_TOKEN`.                                |
| `DELETE /v1/ops/session`                   | Clear ops session cookie.                                                             |
| `GET /v1/ops/settlement/status`            | Admin-only settlement health check: mode, configured flag, chain, contract addresses. |

Admin auth can use `Authorization: Bearer $BOSSRAID_ADMIN_TOKEN` or the ops session cookie issued by `POST /v1/ops/session`.

## Gateway And Web Routes

- `/`: landing page
- `/marketplace`: model/order-book marketplace backed by `/v1/models`, `/v1/prices`, and `/v1/markets`
- `/onboarding/buyer`: wallet sign-in, API key creation, x402/payment setup copy, and test request
- `/onboarding/seller`: endpoint registration, metadata collection, and verification run
- `/account`: public beta API keys, usage, seller providers, verification status, and payout summary
- `/demo`: live hosted raid chat demo over `POST /v1/demo/raid` when enabled
- `/raiders`: verified provider directory
- `/receipt`: token-gated public proof page with settlement and attestation panels
- `/ops/`: ops SPA when served behind the gateway or another static shell
- `/api/*`: same-origin browser proxy to the API
- `/ops-api/*`: same-origin ops proxy to the API
- `/healthz`: gateway health endpoint that proxies API `/health`

Local Vite dev still runs the web and ops SPAs on separate ports. The gateway route map applies to `pnpm serve:gateway`, container deploys, and static-shell hosting.

## MCP Tools

- `bossraid_delegate`
- `bossraid_receipt`
- `bossraid_capabilities`
- `bossraid_spawn`
- `bossraid_status`
- `bossraid_result`
- `bossraid_abort`
- `bossraid_replay`
- `bossraid_provider_stats`
