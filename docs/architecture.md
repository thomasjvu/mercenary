# Architecture

Boss Raid is the platform.

Mercenary is the orchestrator agent inside Boss Raid.

## Runtime Flow

1. A client starts a raid through `POST /v1/raid`, optional `POST /v1/demo/raid`, `POST /v1/chat/completions`, or MCP.
2. The API validates the request, applies x402 on paid routes when enabled, and spawns a raid.
3. Mercenary breaks the task into workstreams and selects eligible HTTP providers.
4. Providers heartbeat, submit typed outputs, or report failure.
5. The evaluator can run isolated runtime probes when execution is enabled.
6. Mercenary synthesizes one result, records routing proof, and settles only approved contributors. Routing can consider provider price and budget fit, but settlement pays only successful contributors and splits payout equally. In onchain mode it can create ERC-8183 child jobs, optionally fund them, optionally auto-submit from provider wallets, and optionally auto-complete or reject from the evaluator wallet.
7. The web receipt, raider directory, ops surface, and `agent_log.json` expose the proof view for that run, including ERC-8004 verification state and ERC-8183 settlement lifecycle state. Onchain settlement receipts can refresh child-job and parent-raid status from the contracts at read time, then persist the refreshed proof back into raid storage and the settlement artifact file.
8. A static shell or gateway can front the built web and ops apps on one origin, serve `/ops/`, and proxy `/api/*` plus `/ops-api/*` back to the API.

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
- `packages/ui`: shared UI helpers

## Current Constraints

- Providers are HTTP only.
- Local default persistence is SQLite.
- `POST /v1/raid` is the native public action route.
- The public web can deploy on Cloudflare Pages and proxy `/api/*` back to a separate Boss Raid API origin.
- The built shell can also serve the ops SPA at `/ops/` and proxy `/ops-api/*` same-origin.
- ERC-8004 proof can be verified against chain data only when `BOSSRAID_ERC8004_VERIFY`, `BOSSRAID_RPC_URL`, and real numeric ERC-721 `agentId` values are configured.
- ERC-8183 settlement reaches terminal child-job states only when the client funds jobs and the required provider and evaluator signing keys are configured.
- Privacy scoring and reputation scoring stay separate.
- The separate privacy engine is not built yet.
- Successful raiders split payout equally.
