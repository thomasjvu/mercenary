# Architecture

Canonical public docs now live at:

- [Platform Architecture](https://boss-raid-docs.pages.dev/docs/platform/architecture)
- [Raid Lifecycle](https://boss-raid-docs.pages.dev/docs/platform/raid-lifecycle)
- [Apps And Packages](https://boss-raid-docs.pages.dev/docs/platform/apps-and-packages)
- [Providers](https://boss-raid-docs.pages.dev/docs/platform/providers)

## Monorepo Note

This file is now a bridge doc inside the app repo.

Keep it updated if the public route map changes or the external docs location changes.

## Current Truth

- Boss Raid is the platform
- Mercenary is the orchestrator agent inside Boss Raid
- the public web surface now includes the landing route `/`, the raider directory route `/raiders`, and the public receipt route `/receipt`
- the public proof surface now also includes `GET /v1/agent.json` plus token-gated per-raid `agent_log.json` routes derived from persisted raid state
- provider routing, discovery, and public roster data now expose ERC-8004 identity metadata and separate trust metadata without mixing that signal into privacy scoring
- the monorepo now includes a Remotion video app for Boss Raid and Mercenary promo renders
- payout is equal split across successful providers only
- privacy scoring and reputation scoring remain separate concerns
- `POST /v1/raid` remains the native public action route
- the public receipt route is a capability-based read surface layered over the existing token-gated raid status and result routes
- x402 gating now wraps the paid public action routes by default unless `BOSSRAID_X402_ENABLED=false`
- x402 gating now creates a short-lived launch reservation before the unpaid `402`, so the paid retry consumes the same reserved provider slot instead of rerunning provider selection after payment
- public x402 billing now includes the request payout budget plus a small platform surcharge
- Mercenary now partitions each multi-expert raid into explicit workstreams and provider sub-roles, authors those objectives and briefs from the request itself, spawns internal child raids per workstream, expands high-pressure scopes through recursive workstream families rather than one fixed nested branch, synthesizes approved child outputs into one canonical parent result, and keeps ranking data as receipt proof
- game-shaped raids now use a dedicated workstream family so Mercenary can split one request into gameplay build, pixel-art pack, and video marketing branches before deeper nested gameplay/art/promo decomposition
- non-text workstreams can now return typed artifact refs, so image and video branches flow through the same parent raid result, receipt, MCP, and ops proof surfaces as patch and text branches
- the repo now includes a real game-demo provider trio on the Boss Raid HTTP provider lane:
  - `Gamma` for gameplay-heavy game-development work
  - `Dottie` for pixel-art packs
  - `Riko` for game-marketing video artifacts
- Mercenary's live execution path routes through Boss Raid HTTP providers discovered from the provider registry; Virtuals ACP currently supplies registration, identity, and marketplace surfaces rather than the direct execution transport
- larger hierarchical raids now reserve a small provider pool for adaptive replanning, inspect live branch outcomes before finalization, and can revise the graph by attaching repair leaves or deeper expansion subgraphs anywhere in the active workstream tree
- every child raid, including adaptive repair and adaptive expansion branches, now inherits the root raid deadline so Mercenary cannot extend the caller's original latency envelope during replanning
- callers can now require registered ERC-8004 providers or a minimum trust score when Mercenary routes workstreams
- strict privacy routing now prefers Venice-backed providers without mixing that private-lane decision into trust or reputation scoring
- the Venice private lane is enforced as a routing preference inside provider selection and persisted in `routingProof`, so receipt and agent-log views can show when Mercenary stayed on Venice-backed providers
- chat completions are the OpenAI-compatible text synthesis ingress over the same raid engine and default to two experts unless the caller overrides the raid policy
- provider routing now respects active provider concurrency
- provider workers now require explicit bearer or hmac auth unless local development explicitly opts into insecure mode
- settlement proof now surfaces an ERC-8183-aligned proof envelope with `proofStandard`, settlement contracts, the final registry call, and linked child-job records across result, receipt, ops, and agent-log views
- raid records now persist `routingProof` so the receipt and log surfaces can show policy, Venice lane usage, ERC-8004 gating, and per-provider routing reasons from recorded state
- deployed container topology now runs a public gateway plus the API, evaluator, and HTTP provider workers, with the evaluator isolated off-network behind a shared Unix socket
- the gateway owns `/`, `/ops/`, `/api`, and `/ops-api` so the ops session stays same-origin in container deployments
- real runtime probes now run in a separate evaluator container that listens on a shared Unix socket and ships with `network_mode: none` in the local and Phala compose files
- the gateway, API, and provider workers now run from the shared app image, while the evaluator launcher and disposable evaluator jobs use separate images
- each runtime probe now runs in its own disposable job container in the shipped compose path, with the evaluator service reduced to a launcher and policy boundary
- the runtime image now runs as non-root, and the shipped compose topology defaults services to read-only root filesystems with tmpfs scratch space
- Phala-targeted deployments mount the TEE socket into the API container, and the admin runtime route exposes that mount state for ops verification
- EigenCompute-targeted deployments collapse the gateway, API, evaluator, and provider workers into one TEE container via [scripts/serve-eigencompute.mjs](/Users/area/Desktop/boss-raid/scripts/serve-eigencompute.mjs)
- the current recommended hosted split keeps the Boss Raid control plane on EigenCompute and moves the HTTP provider fleet onto Phala, with the Eigen provider manifest overriding provider endpoints to public Phala URLs
- the EigenCompute image can optionally launch disposable evaluator job containers when the runtime mounts a Docker-compatible socket, but the default EigenCompute path remains per-job process isolation
- the public [docs/eigencompute-deployment.md](/Users/area/Desktop/boss-raid/docs/eigencompute-deployment.md) flow uses `/v1/attested-runtime` for enclave posture and `/v1/raid/:raidId/attested-result` for enclave-signed raid output using the app wallet

Use the external docs for the full architecture breakdown.
