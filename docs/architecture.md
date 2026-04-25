# Architecture

Boss Raid is the platform.

Mercenary is the orchestrator agent inside Boss Raid.

## Runtime Flow

1. A client starts a raid through `POST /v1/raid`, optional `POST /v1/demo/raid`, `POST /v1/chat/completions`, or MCP.
2. The API validates the request, applies x402 on paid routes when enabled, persists control state plus any paid launch reservation, and then spawns a raid.
3. Mercenary breaks the task into workstreams, selects eligible HTTP providers, and persists the resulting run state before it starts provider execution.
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
- `apps/web`: landing page, raider directory, and public receipt
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
- `POST /v1/raid` is the native public action route.
- x402 payments are enabled by default; the recipient wallet is configured via `BOSSRAID_X402_PAY_TO`.
- The active hosted TEE runtime is the Phala CVM stack. The EigenCompute wrapper remains in-repo as an optional judging and attestation lane, not the default paid runtime.
- The public web can deploy on Cloudflare Pages and proxy `/api/*` back to a separate Boss Raid API origin.
- The built shell can also serve the ops SPA at `/ops/` and proxy `/ops-api/*` same-origin.
- ERC-8004 identity is registered through the Virtuals ACP platform. Boss Raid consumes the resulting `erc8004` refs and verifies them against chain data when `BOSSRAID_ERC8004_VERIFY=true` and `BOSSRAID_RPC_URL` is configured.
- ERC-8183 settlement reaches terminal child-job states only when `BOSSRAID_SETTLEMENT_MODE=onchain`, wallet keys are configured, and the client wallet holds sufficient USDC for escrow funding.
- Provider privacy attestation is submitted with each work result; the privacy engine gates settlement for strict-private raids.
- Successful raiders split payout equally.
