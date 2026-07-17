# Architecture

Boss Raid is the platform. Mercenary is the orchestrator agent.

Read this page when you need the system map: two buyer lanes, how routing and settlement connect, and where attestation fits. Lane walkthroughs live in [introduction.md](../overview/introduction.md).

## Two buyer lanes

| Lane               | Route                                             | Behavior                                  |
| ------------------ | ------------------------------------------------- | ----------------------------------------- |
| Discount inference | `POST /v1/inference/chat/completions`             | One model call → cheapest eligible seller |
| Mercenary raid     | `POST /v1/raid`, `POST /v1/chat/completions`, MCP | Decompose → route → evaluate → synthesize |

Both lanes share provider registry, routing proof, receipts, and settlement. Marketplace discovery: `GET /v1/models`, `GET /v1/prices`, `GET /v1/markets`.

Full discount-inference design: [discount-inference.md](../buyers/discount-inference.md).

## Discount inference

Single-provider marketplace lane. API normalizes every request to `maxAgents: 1` and `selectionMode: cost_first` (`apps/api/src/lib/inference-marketplace-policy.ts`).

**Buyer account loop** — wallet session → `br_` API keys → optional prepaid balance → inference call. API keys skip x402 (`apps/api/src/handlers/payment.ts`). Purchases and benchmark savings land in buyer ledger (`apps/api/src/control-state/buyer-ledger.ts`). Response `bossraid` metadata includes `selected_seller`, `savings_usd`, `rate_card_hash` (`apps/api/src/handlers/billing-mana.ts`).

**Seller account loop** — HTTP providers or hosted upstream offers (`inference_hosted`) → earnings ledger (`apps/api/src/control-state/seller-ledger.ts`) → payout on approval. Paused offers and 5-minute routing cooldowns after dispatch failure keep bad sellers out of the order book (`apps/orchestrator/src/orchestrator-provider-registry.ts`).

**Settlement** — single-provider inference uses a `$0.01` payout floor (`packages/constants/src/settlement.ts`). Multi-agent raids keep the `$0.25` default.

**Catalog** — `packages/constants/src/inference-catalog.ts` fills discovery when no live seller exists. Benchmark prices drive `savings_usd` (`packages/constants/src/marketplace-benchmark.ts`).

**Privacy forks** — strict E2EE catalog models use the Venice relay (`apps/api/src/lib/e2ee-chat-route.ts`). Trusted Alkahest clients get a hardened Gemma-only strict lane (`readTrustedAlkahestClient` in `inference-marketplace-policy.ts`).

## Runtime flow

1. Client hits API (raid, chat, inference, or MCP).
2. API validates, applies x402 when enabled, persists launch reservation, spawns raid.
3. Mercenary plans workstreams, selects HTTP providers (or one seller for inference), persists run state.
4. Providers heartbeat, submit outputs, or report failure.
5. Evaluator runs isolated probes when execution is enabled.
6. Mercenary synthesizes one result and settles approved contributors only. Successful providers split payout equally.
7. Receipt, `agent_log.json`, and attestation routes expose proof. Onchain mode can refresh settlement state at read time.
8. On restart, nonterminal raids resume from persisted state.

## Hosted Venice sellers

Self-serve sellers connect a Venice API key in the web UI. The API stores the key encrypted in control state, materializes one provider profile per selected model, and routes inference through an embedded hosted gateway:

1. Seller `POST /v1/seller/upstream/:provider/connect` validates the key against upstream `GET /models` (`anthropic`, `zai`, `xai`, `venice`, `redpill`, `near`, `chutes`, `phala`).
2. Seller `POST /v1/seller/upstream/:provider/offers` registers offers with `lane: "chat"` (`inference_hosted`) or `lane: "harness"` (`harness_hosted`) and `source.targetType = :provider`.
3. Each offer endpoint is `{BOSSRAID_INFERENCE_GATEWAY_BASE}/gateway/{providerId}`.
4. Gateway `POST /v1/raid/accept` proxies the raid task to the upstream chat API (or platform agent-harness tool loop), verifies TEE attestation when privacy features are claimed, and records the provider submission in-process.
5. Buyers and sellers verify upstream TEE via `POST /v1/marketplace/tee/attestation` (provider-specific nonce + Intel/NVIDIA evidence; explorer link to proof.t16z.com).

**Platform liquidity:** ops can seed featured chat offers with `POST /v1/ops/platform-liquidity/bootstrap` (admin token) when matching `BOSSRAID_*_API_KEY` values are set. Optional startup: `BOSSRAID_BOOTSTRAP_PLATFORM_LIQUIDITY=1`. Platform seats use `source.externalRef = "platform"` and fall back to platform keys (no per-seller Phala). Phala defaults to platform seats only (empty seed + purge of demo workers `dottie` / `riko` / `gamma`). Featured xAI models and `reasoning_effort` pass-through: [discount-inference.md](../buyers/discount-inference.md#platform-seats-xai--grok).

Buyers still use `POST /v1/inference/chat/completions`. The static inference catalog fills discovery gaps when no live seller exists for a model. Chat is **stateless** — clients own multi-turn history.

### Production readiness (honest)

Full production requires `GET /v1/ops/production-readiness` → `ok: true` (onchain settlement, Phala TEE + `MNEMONIC`, container eval, strong secrets, no mocks, operator acks). **Money rail is Robinhood + USDG only** (Marian facilitator). SQLite is allowed with a storage warning for **v1 controlled launch** (single API process); multi-replica HA needs a future Postgres adapter — not Convex. x402 may stay off for private rehearsal. Feature code can be ready while a specific host is still blocked by ops gates.

## Apps

- `apps/api` — public API, auth, x402, proof routes, hosted inference gateway
- `apps/orchestrator` — planning, routing, synthesis, settlement (library embedded in `api`; not a separate production process)
- `apps/provider-agent` — HTTP provider worker
- `apps/evaluator` — sandboxed runtime probes
- `apps/mcp-server` — MCP adapter
- `apps/web` — marketplace, onboarding, receipt
- `apps/ops` — internal control surface

## Packages

Full stack map: [Tech Stack](/dev-docs/operators/tech-stack) in dev-docs. Core groups: foundation (`shared-types`, `constants`, `api-contracts`, `openapi-schemas`), raid stack (`raid-core`, `provider-registry`, `provider-sdk`, `evaluation`, `scoring`, `sandbox-runner`), storage (`persistence`, `persistence-sqlite`, `persistence-postgres`), UI/proof (`ui`, `proof-ui`), integrations (`privacy-engine`, `smart-pay`, `venice-client`, `oneshot-relayer`, `http-client`, `logger`), deploy/test (`contracts`, `test-fixtures`).

## Attestation & proof

| Surface              | Route                                  | Purpose                                                                                              |
| -------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Public host          | `GET /v1/host/attestation`             | Phala TDX quote via dstack (`/var/run/dstack.sock`); optional `signedRuntime` when `MNEMONIC` is set |
| Admin runtime        | `GET /v1/attested-runtime`             | Signed runtime envelope for operators                                                                |
| Raid result          | `GET /v1/raid/:raidId/attested-result` | Signed synthesized output                                                                            |
| Marketplace upstream | `POST /v1/marketplace/tee/attestation` | Hosted seller TEE verification                                                                       |
| Web inspector        | Sidebar, receipt, marketplace panels   | Host quote, runtime signing, upstream TEE rows                                                       |

Host attestation exposes separate signals: `teeVerified` (hardware quote) and `runtimeSigned` (MNEMONIC envelope). Top-level `verified` tracks TEE quote validity only.

Strict-private raids re-verify provider privacy attestations server-side (`BOSSRAID_PRIVACY_SERVER_VERIFY`, default on). Provider callbacks alone are not trusted for `featuresVerified`.

Known gaps: attestation telemetry on raid timelines is still partial. `MNEMONIC` is required for Phala production signed envelopes and is listed in the Phala core secrets tier (`deploy/phala/secrets.core.env.example`). See [proof.md](../overview/proof.md).

## Constraints

- Providers are HTTP only.
- `POST /v1/raid` is the native public action route.
- x402 is opt-in (ops toggle).
- ERC-8004 identity via Virtuals ACP; Boss Raid consumes and optionally verifies refs.
- ERC-8183 settlement needs `BOSSRAID_SETTLEMENT_MODE=onchain` plus funded signers.
- Privacy engine gates strict-private raids; privacy scoring ≠ reputation scoring.
- Hosted TEE runtime: Phala CVM (EigenCompute optional for judging lanes).

## Repo layout

See root [README.md](../../README.md#repo-layout).
