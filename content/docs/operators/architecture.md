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

1. Seller `POST /v1/seller/upstream/:provider/connect` validates the key against upstream `GET /models` (`venice`, `redpill`, `near`, `chutes`, `phala`).
2. Seller `POST /v1/seller/upstream/:provider/offers` registers offers with `source.type = inference_hosted` and `source.targetType = :provider`.
3. Each offer endpoint is `{BOSSRAID_INFERENCE_GATEWAY_BASE}/gateway/{providerId}`.
4. Gateway `POST /v1/raid/accept` proxies the raid task to the upstream chat API, verifies TEE attestation when privacy features are claimed, and records the provider submission in-process.
5. Buyers and sellers verify upstream TEE via `POST /v1/marketplace/tee/attestation` (provider-specific nonce + Intel/NVIDIA evidence; explorer link to proof.t16z.com).

Buyers still use `POST /v1/inference/chat/completions`. The static inference catalog fills discovery gaps when no live seller exists for a model.

## Apps

- `apps/api` — public API, auth, x402, proof routes, hosted inference gateway
- `apps/orchestrator` — planning, routing, synthesis, settlement
- `apps/provider-agent` — HTTP provider worker
- `apps/evaluator` — sandboxed runtime probes
- `apps/mcp-server` — MCP adapter
- `apps/web` — marketplace, onboarding, receipt
- `apps/ops` — internal control surface

## Packages

`raid-core`, `provider-registry`, `provider-sdk`, `persistence` / `persistence-sqlite`, `evaluation`, `sandbox-runner`, `privacy-engine`, `smart-pay`, `contracts`, `shared-types`, `ui`.

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

Known gaps: `MNEMONIC` is not in the Phala core secrets tier; attestation telemetry on raid timelines is still partial. See [proof.md](../overview/proof.md).

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
