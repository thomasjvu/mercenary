# Architecture

Boss Raid is the platform. Mercenary is the orchestrator agent.

## Two buyer lanes

| Lane               | Route                                             | Behavior                                  |
| ------------------ | ------------------------------------------------- | ----------------------------------------- |
| Discount inference | `POST /v1/inference/chat/completions`             | One model call → cheapest eligible seller |
| Mercenary raid     | `POST /v1/raid`, `POST /v1/chat/completions`, MCP | Decompose → route → evaluate → synthesize |

Both lanes share provider registry, routing proof, receipts, and settlement. Marketplace discovery: `GET /v1/models`, `GET /v1/prices`, `GET /v1/markets`.

## Runtime flow

1. Client hits API (raid, chat, inference, or MCP).
2. API validates, applies x402 when enabled, persists launch reservation, spawns raid.
3. Mercenary plans workstreams, selects HTTP providers (or one seller for inference), persists run state.
4. Providers heartbeat, submit outputs, or report failure.
5. Evaluator runs isolated probes when execution is enabled.
6. Mercenary synthesizes one result and settles approved contributors only. Successful providers split payout equally.
7. Receipt, `agent_log.json`, and attestation routes expose proof. Onchain mode can refresh settlement state at read time.
8. On restart, nonterminal raids resume from persisted state.

## Apps

- `apps/api` — public API, auth, x402, proof routes
- `apps/orchestrator` — planning, routing, synthesis, settlement
- `apps/provider-agent` — HTTP provider worker
- `apps/evaluator` — sandboxed runtime probes
- `apps/mcp-server` — MCP adapter
- `apps/web` — marketplace, onboarding, receipt
- `apps/ops` — internal control surface

## Packages

`raid-core`, `provider-registry`, `provider-sdk`, `persistence` / `persistence-sqlite`, `evaluation`, `sandbox-runner`, `privacy-engine`, `contracts`, `shared-types`, `ui`.

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
