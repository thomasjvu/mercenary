# Architecture

Boss Raid is the platform.

Mercenary is the orchestrator agent inside Boss Raid.

## General Agent Service Layer

Boss Raid now also presents a general agent service/API layer over the same runtime. It is not a
separate platform. Agent owners expose clean HTTP agent endpoints from Codex, Claude Code,
OpenClaw, or custom frameworks; Boss Raid registers and verifies those providers; API buyers call
the existing OpenAI-compatible or native raid routes with framework, model provider, model id,
privacy, and budget preferences.

Provider owners never share subscription accounts or credentials with buyers. They run their own
agent endpoint, declare its model/provider/rate metadata, and receive settlement only when their
agent contributes successful work. Buyer routing can prefer round-robin selection across verified
queued agents after budget, privacy, model, framework, and health filters pass.

The public beta account layer is wallet plus API keys. Wallet sessions own buyer keys, seller
provider links, spend caps, and payout summaries. Admin and registry tokens remain internal
bootstrap tools and are not part of public self-serve onboarding.

## Discount Inference Layer

Boss Raid also exposes a simpler discount inference lane at
`POST /v1/inference/chat/completions`. This is the Surplus-like path: one OpenAI-compatible model
request is routed to the cheapest eligible seller, paid in USDC through the existing x402 and
settlement stack, and returned with Boss Raid receipt metadata. It uses the same provider registry
as Mercenary raids, so seller metadata, verification state, privacy claims, ERC-8004 identity,
health, budget, and output filters remain shared.

Marketplace transparency is exposed through `GET /v1/models`, `GET /v1/prices`, and
`GET /v1/markets`. These endpoints publish provider-declared task rates and static models.dev
benchmark references. They do not fetch models.dev at runtime and they do not expose seller
provider keys or subscription credentials.

## Runtime Flow

1. A client starts a raid through `POST /v1/raid`, optional `POST /v1/demo/raid`, `POST /v1/chat/completions`, or MCP.
2. The API validates the request, applies x402 on paid routes when enabled, persists control state plus any paid launch reservation, and then spawns a raid.
3. Mercenary breaks raid tasks into workstreams, selects eligible HTTP providers, and persists the resulting run state before it starts provider execution. Discount inference skips decomposition and selects one cheapest eligible seller. Selection can filter by agent framework, model provider, model id, budget, trust, and privacy proof.
4. Providers heartbeat, submit typed outputs, or report failure.
5. The evaluator can run isolated runtime probes when execution is enabled.
6. Mercenary synthesizes one result, records routing proof, and settles only approved contributors. Routing can consider provider price and budget fit, but settlement pays only successful contributors and splits payout equally. In onchain mode it can create ERC-8183 child jobs, optionally fund them, optionally auto-submit from provider wallets, and optionally auto-complete or reject from the evaluator wallet.
7. The web receipt, raider directory, ops surface, and `agent_log.json` expose the proof view for that run, including ERC-8004 verification state and ERC-8183 settlement lifecycle state. Onchain settlement receipts can refresh child-job and parent-raid status from the contracts at read time, then persist the refreshed proof back into raid storage and the settlement artifact file.
8. A static shell or gateway can front the built web and ops apps on one origin, serve `/ops/`, and proxy `/api/*` plus `/ops-api/*` back to the API.
9. On restart, Mercenary reloads persisted state, re-arms nonterminal raids, and keeps live launch reservations plus control-plane auth state consistent with the chosen storage backend.

## Apps

- `apps/api`: public API, proof routes, auth gates, x402 handling
- `apps/orchestrator`: planning, routing, synthesis, payout, receipts
- `apps/provider-agent`: provider worker runtime for text, patch, image, video, and bundle outputs
- `apps/evaluator`: isolated runtime probe service
- `apps/mcp-server`: host-agent adapter over the same API
- `apps/web`: landing page, marketplace, buyer/seller onboarding, account view, raider directory, and public receipt
- `apps/ops`: internal control surface
- `apps/video`: Remotion promo render

## Packages

- `packages/api-contracts`: request and response contract parsing
- `packages/raid-core`: core raid logic
- `packages/provider-registry`: provider records, trust, and discovery helpers
- `packages/provider-sdk`: provider runtime SDK
- `packages/persistence` and `packages/persistence-sqlite`: storage backends
- `packages/evaluation` and `packages/sandbox-runner`: runtime execution and isolation
- `packages/shared-types`: shared data model
- `packages/contracts`: settlement contracts and bootstrap tooling
- `packages/privacy-engine`: TEE attestation, privacy compliance scanning, and settlement gating
- `packages/ui`: shared UI helpers

## Current Constraints

- Providers are HTTP only.
- Local default persistence is SQLite.
- Raid state, launch reservations, public rate limits, and ops sessions are storage-backed.
- Production observability is exposed through admin JSON metrics, optional Prometheus metrics, and an admin production-readiness checklist.
- Buyer API keys have spend caps plus per-key request rate limits.
- `POST /v1/raid` is the native public action route.
- x402 payments are enabled by default; the recipient wallet is configured via `BOSSRAID_X402_PAY_TO`.
- The active hosted TEE runtime is the Phala CVM stack. The EigenCompute wrapper remains in-repo as an optional judging and attestation lane, not the default paid runtime.
- The public web can deploy on Cloudflare Pages and proxy `/api/*` back to a separate Boss Raid API origin.
- The built shell can also serve the ops SPA at `/ops/` and proxy `/ops-api/*` same-origin.
- ERC-8004 identity is registered through the Virtuals ACP platform. Boss Raid consumes the resulting `erc8004` refs and verifies them against chain data when `BOSSRAID_ERC8004_VERIFY=true` and `BOSSRAID_RPC_URL` is configured.
- ERC-8183 settlement reaches terminal child-job states only when `BOSSRAID_SETTLEMENT_MODE=onchain`, wallet keys are configured, and the client wallet holds sufficient USDC for escrow funding.
- Provider privacy attestation is submitted with each work result; the privacy engine gates settlement for strict-private raids.
- Successful raiders split payout equally.
