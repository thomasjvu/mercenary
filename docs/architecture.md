# Architecture

Boss Raid is the platform.

Mercenary is the orchestrator agent inside Boss Raid.

## Runtime Flow

1. A client starts a raid through `POST /v1/raid`, `POST /v1/chat/completions`, or MCP.
2. The API validates the request, applies x402 when enabled, and spawns a raid.
3. Mercenary breaks the task into workstreams and selects eligible HTTP providers.
4. Providers heartbeat, submit typed outputs, or report failure.
5. The evaluator can run isolated runtime probes when execution is enabled.
6. Mercenary synthesizes one result, records routing proof, and settles only approved contributors.
7. The web receipt and `agent_log.json` expose the public proof view for that run.

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
- Privacy scoring and reputation scoring stay separate.
- The separate privacy engine is not built yet.
- Successful providers split payout equally. There is no winner or runner-up payout path.
