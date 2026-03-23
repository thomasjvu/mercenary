# Boss Raid

One task. The right agents. One result with proof.

Boss Raid is the platform and raid flow.

Mercenary is the orchestrator agent inside Boss Raid. It turns one task into scoped specialist workstreams, routes them to the right providers, verifies the outputs, returns one canonical multi-agent synthesis result, and settles approved contributors evenly.

Internal package names and env vars already use `bossraid` and `BOSSRAID_*`.

## Current State

- public landing app, ops app, API, provider workers, evaluator, persistence, and settlement tooling are in repo
- Remotion video app for Boss Raid and Mercenary promo renders is now in repo
- public web app now frames Boss Raid as a private tool surface at `/`, exposes the raider directory at `/raiders`, and exposes a public receipt route at `/receipt`
- native `POST /v1/raid` route is live as the general orchestration ingress
- text-first `POST /v1/chat/completions` compatibility route is live as the OpenAI-compatible synthesis ingress over the same raid engine
- x402 payment gating now wraps paid public routes by default unless `BOSSRAID_X402_ENABLED=false`
- x402 launch challenges are now reservation-bound, so provider capacity stays held from the unpaid `402` through the paid retry
- native `/v1/raid` request model is live in the API and ops launch surface
- provider registry routes are live: register, heartbeat, discover
- registry heartbeats now drive discovery eligibility and stale providers are auto-degraded
- live discovery and raid spawn now probe provider readiness before routing
- Mercenary now partitions raids into explicit workstreams and provider sub-roles, authors their objectives and briefs from the incoming request, then fans multi-expert raids into internal child raids under one parent raid handle through recursive workstream families instead of a fixed front-layer role table
- game-shaped raids can now route through a dedicated workstream family: gameplay build, pixel-art pack, and video marketing, with deeper nested gameplay/art/promo branches when the expert count grows
- provider submissions can now return typed artifact refs for image, video, and bundle outputs, and the receipt plus ops surfaces render those artifacts directly
- the game demo provider trio now runs as real Boss Raid HTTP providers:
  - `Gamma` produces gameplay patches and starter bundles for small game-development slices
  - `Dottie` produces pixel-art PNGs, spritesheets, and metadata bundles
  - `Riko` produces storyboard frames, launch copy, source bundles, and preview video artifacts for game marketing
- Mercenary now orchestrates that game demo trio through the native raid engine, not as a pitch-only mock
- ACP remains the registration, identity, and marketplace lane; Mercenary's current live execution lane is the Boss Raid HTTP provider registry unless a direct ACP bridge is added
- larger hierarchical raids now hold back a small adaptive reserve, inspect live branch outcomes, and either graft repair leaves or deeper expansion subgraphs onto weak workstreams before the parent raid finalizes
- child raids and adaptive repair/expansion branches now inherit the original parent deadline, so Mercenary cannot extend the caller latency envelope mid-run
- registry write routes now require `Authorization: Bearer $BOSSRAID_REGISTRY_TOKEN`
- internal control routes now accept `Authorization: Bearer $BOSSRAID_ADMIN_TOKEN` for automation and an HTTP-only ops session for the ops UI
- public raid status and result reads now require the per-raid access token returned at spawn time unless the caller is admin-authenticated
- native spawn responses now also return `receiptPath` so callers can open the public proof page directly
- equal split payout for successful providers is live
- no winner bonus or runner-up payout path remains
- real HTTP providers are required
- provider workers now fail closed on missing auth config unless local development explicitly opts into `BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH=1`
- SQLite-backed state is now supported and is the local default
- file-backed settlement artifacts work now
- on-chain settlement bootstrap exists
- MCP is now a stateless adapter over the HTTP API
- MCP now exposes high-level `bossraid_delegate` and `bossraid_receipt` tools for private coding workflows
- provider manifests now carry separate privacy metadata next to reputation metadata
- provider records now expose separate computed `privacyScore` and `reputationScore`
- raid selection now routes through the same provider discovery path used by `/agents/discover`
- heartbeat stale timeouts are now enforced during active provider runs
- caller-supplied test commands are not executed during evaluation
- evaluator defaults to offline static/proxy scoring and only runs repo-native build/test probes when `BOSSRAID_EVAL_RUNTIME_EXECUTION=true`
- production still blocks host-side runtime probes unless `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION=true` is also set
- real runtime probes can now be isolated behind the private evaluator service with `BOSSRAID_EVAL_SANDBOX_MODE=socket`
- public provider list and health routes now strip auth material and private diagnostics
- provider health probes now time out via `BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS`
- web and ops now default to same-origin proxy paths so the local stack does not depend on browser CORS
- container deployment now ships a single public gateway for `/`, `/ops`, `/api`, and `/ops-api`
- Docker packaging is now in repo for local compose and Phala CVM deployment with separate app, evaluator, and evaluator-job images
- EigenCompute single-container packaging is now in repo for the EigenCloud TEE track
- admin runtime diagnostics now expose deploy posture, evaluator safety flags, and mounted TEE socket state
- `GET /v1/attested-runtime` now returns a TEE-wallet-signed runtime proof when `MNEMONIC` is available
- `GET /v1/raid/:raidId/attested-result` now returns a TEE-wallet-signed proof for the actual raid result when `MNEMONIC` is available
- `GET /v1/agent.json` now exposes the live Mercenary manifest
- token-gated `GET /v1/raid/:raidId/agent_log.json` and `GET /v1/raids/:raidId/agent_log.json` now expose derived run logs for one raid
- provider registration, discovery, and public provider records now carry explicit `erc8004` identity metadata and separate `trust` metadata
- native raids, compatibility chat requests, and provider discovery can now require registered ERC-8004 providers and minimum trust scores through `requireErc8004` and `minTrustScore`
- provider routing now respects provider `maxConcurrency`
- trust-aware routing now stays separate from privacy scoring and can prefer or reject providers with ERC-8004-backed trust signals
- strict privacy mode now prefers Venice-backed providers and keeps that decision visible in the recorded routing proof
- malformed public requests now return `400`
- ops now exposes an internal raid receipt with synthesized output, ranked contribution proof, settlement proof, and reputation events
- web now exposes a public raid receipt page that reads the same proof data through `raidId` plus `raidAccessToken`
- settlement proof surfaces now expose `proofStandard`, settlement contract addresses, the registry call proof, and per-provider child-job proof
- MCP now retries local HMAC x402 challenges automatically when `BOSSRAID_X402_VERIFY_HMAC_SECRET` is set
- `pnpm demo:rehearse` now runs the local demo rehearsal path end to end, including MCP delegate smoke

## Not Done Yet

- fully separate privacy and reputation storage/services
- Cloudflare D1 adapter
- per-job VM or microVM isolation for runtime probes

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm dev
```

Local URLs:

- web: `http://127.0.0.1:4173`
- raiders: `http://127.0.0.1:4173/raiders`
- receipt: `http://127.0.0.1:4173/receipt?raidId=<raidId>&token=<raidAccessToken>`
- ops: `http://127.0.0.1:4174`
- API: `http://127.0.0.1:8787`
- manifest: `http://127.0.0.1:8787/v1/agent.json`
- evaluator socket: `/tmp/bossraid-evaluator.sock` when started by `pnpm dev`
- evaluator HTTP fallback: `http://127.0.0.1:8790` when started directly with `pnpm dev:evaluator`
- providers: `http://127.0.0.1:9001`, `9002`, `9003`

`pnpm dev`, `pnpm dev:api`, `pnpm dev:mcp`, and `pnpm dev:providers` load `.env` automatically.

`pnpm dev` now starts the evaluator, API, web, ops, and local providers together.

`pnpm dev:video` starts the Remotion studio for the Boss Raid promo composition.

`pnpm game-raid:build-payload -- --repo /path/to/game --file project.gbsproj --file scripts/game.ts --title "Boss Raid: Slime Panic"` builds a repo-specific native raid payload, Claude Code or Codex delegate payload, and provider submission templates under `temp/game-raid-payload`.

`pnpm test:game-raid:e2e` builds the repo, boots the compiled Boss Raid game providers plus API, posts [examples/game-raid/native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/native-raid.json) to `POST /v1/raid`, and verifies one final Mercenary synthesis with patch, image, video, bundle, and routing proof.

`pnpm test:private-game-raid:e2e` builds the repo, boots the compiled Boss Raid game providers plus API, posts [examples/game-raid/private-native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/private-native-raid.json) to `POST /v1/raid`, and verifies the same multi-artifact game synthesis under strict Venice-only privacy routing.

Docker quick start:

```bash
pnpm docker:build
pnpm docker:up
```

The gateway listens on `http://127.0.0.1:8080` and serves the public web app at `/`, the ops app at `/ops/`, and same-origin API proxies at `/api` and `/ops-api`.
`pnpm docker:build` now builds three local images: the shared app runtime, the evaluator launcher, and the disposable evaluator job image.
`pnpm docker:up` now auto-detects the local Docker socket path and socket group for evaluator job isolation on Docker Desktop and standard Linux sockets, and it prebuilds the evaluator job image when needed.

`GET /v1/runtime`, `GET /v1/raids`, `POST /v1/raid/:raidId/abort`, `POST /v1/raids/:raidId/abort`, `POST /v1/evaluations/:raidId/replay`, and `GET /v1/providers/:providerId/stats` accept the admin bearer for CLI/automation. The ops UI now uses `POST /v1/ops/session` to mint an HTTP-only session instead of shipping the bearer in the bundle.

The Docker and Phala compose stacks now enable real runtime execution through the private evaluator service over a shared Unix socket while keeping `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION=false`. The evaluator service itself runs from a separate launcher image with no network in the shipped compose files.
The shipped compose path now defaults to disposable per-job containers for runtime probes. The long-lived evaluator service only launches and supervises those jobs.

EigenCompute quick start:

```bash
cp deploy/eigencompute/.env.example .env.eigencompute
pnpm eigencompute:build
```

The EigenCompute image collapses the gateway, API, evaluator, and local provider workers into one `linux/amd64` container for TEE deployment. It exposes only port `8080` publicly and keeps the API, evaluator, and provider workers on loopback inside the enclave.

`GET /v1/attested-runtime` signs enclave runtime posture, and `GET /v1/raid/:raidId/attested-result` signs the actual raid result. When EigenCompute injects `MNEMONIC`, the API uses the TEE app wallet so the demo can show verifiable enclave-backed output rather than an unsigned receipt.

`POST /v1/raid` and `POST /v1/raids` now return `raidAccessToken` plus `receiptPath`. Public reads against `GET /v1/raid/:raidId`, `GET /v1/raid/:raidId/result`, `GET /v1/raid/:raidId/attested-result`, `GET /v1/raids/:raidId`, `GET /v1/raids/:raidId/result`, and `GET /v1/raids/:raidId/attested-result` must send `x-bossraid-raid-token: <raidAccessToken>` unless the caller is using admin auth. `GET /v1/raid/:raidId/result` and `GET /v1/raids/:raidId/result` now also expose `adaptivePlanning` when Mercenary revised the graph, including reserve counts and replan history. Result, receipt, and agent-log proof now also expose `routingProof` for provider-selection rationale plus `settlementExecution.proofStandard`, `settlementExecution.contracts`, `settlementExecution.registryCall`, and `settlementExecution.childJobs`. `GET /v1/raid/:raidId/agent_log.json` and `GET /v1/raids/:raidId/agent_log.json` accept the same token either as the header or as `?token=` for file-style proof links. The public receipt page is a thin client over those same read routes.

The EigenCompute image can also run optional disposable evaluator job containers when the runtime mounts a Docker-compatible socket into the app container. Build the companion job image with `pnpm eigencompute:build-job`, then set `BOSSRAID_EVAL_JOB_ISOLATION=container`, `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE`, and `BOSSRAID_EVAL_DOCKER_SOCKET_PATH`. This is not the default path because the current EigenCompute docs do not document a standard nested-container socket mount workflow.

You can verify either attestation envelope locally with:

```bash
pnpm verify:attestation < response.json
```

## Important Env

- `BOSSRAID_PROVIDERS_FILE`
- `BOSSRAID_STORAGE_BACKEND`
- `BOSSRAID_SQLITE_FILE`
- `BOSSRAID_MODEL_API_KEY`
- `BOSSRAID_MODEL_API_BASE`
- `BOSSRAID_MODEL`
- `BOSSRAID_MODEL_REASONING_EFFORT`
- `BOSSRAID_ADMIN_TOKEN`
- `BOSSRAID_DEPLOY_TARGET`
- `BOSSRAID_API_HOST`
- `BOSSRAID_GATEWAY_HOST`
- `BOSSRAID_API_ORIGIN`
- `BOSSRAID_OPS_SESSION_TTL_SEC`
- `BOSSRAID_API_BODY_LIMIT_BYTES`
- `BOSSRAID_PUBLIC_RATE_LIMIT_MAX`
- `BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS`
- `BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX`
- `BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS`
- `BOSSRAID_TRUST_PROXY`
- `BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS`
- `BOSSRAID_PROVIDER_AUTH_TYPE`
- `BOSSRAID_PROVIDER_TOKEN`
- `BOSSRAID_PROVIDER_SECRET`
- `BOSSRAID_PROVIDER_MODE`
- `BOSSRAID_CALLBACK_AUTH_TYPE`
- `BOSSRAID_CALLBACK_TOKEN`
- `BOSSRAID_CALLBACK_SECRET`
- `BOSSRAID_EVAL_SANDBOX_MODE`
- `BOSSRAID_EVAL_SANDBOX_SOCKET`
- `BOSSRAID_EVAL_SANDBOX_URL`
- `BOSSRAID_EVAL_SANDBOX_TOKEN`
- `BOSSRAID_EVAL_SANDBOX_TIMEOUT_MS`
- `BOSSRAID_EVAL_JOB_ISOLATION`
- `BOSSRAID_IMAGE`
- `BOSSRAID_EVALUATOR_IMAGE`
- `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE`
- `BOSSRAID_EVAL_DOCKER_SOCKET_PATH`
- `BOSSRAID_EVAL_SOCKET_PATH`
- `BOSSRAID_EVAL_HOST`
- `BOSSRAID_EVAL_BODY_LIMIT_BYTES`
- `BOSSRAID_EVAL_JOB_TIMEOUT_MS`
- `BOSSRAID_PROVIDER_HOST`
- `BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH`
- `BOSSRAID_ERC8004_AGENT_ID`
- `BOSSRAID_ERC8004_OPERATOR_WALLET`
- `BOSSRAID_ERC8004_REGISTRATION_TX`
- `BOSSRAID_ERC8004_IDENTITY_REGISTRY`
- `BOSSRAID_ERC8004_REPUTATION_REGISTRY`
- `BOSSRAID_ERC8004_VALIDATION_REGISTRY`
- `BOSSRAID_ERC8004_VALIDATION_TXS`
- `BOSSRAID_ERC8004_LAST_VERIFIED_AT`
- `BOSSRAID_VENICE_API_BASE`
- `BOSSRAID_VENICE_MODEL`
- `VENICE_API_KEY_GAMMA`
- `VENICE_API_KEY_RIKO`
- `VENICE_API_KEY_DOTTIE`
- `VENICE_MODEL`
- `BOSSRAID_TEE_PLATFORM`
- `BOSSRAID_TEE_SOCKET_PATH`
- `MNEMONIC`
- `BOSSRAID_WEB_DIST_DIR`
- `BOSSRAID_OPS_DIST_DIR`
- `BOSSRAID_EVAL_RUNTIME_EXECUTION`
- `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION`

Optional legacy file backend env:

- `BOSSRAID_STATE_FILE`

Chain env is only needed for on-chain settlement:

- `BOSSRAID_RPC_URL`
- `BOSSRAID_DEPLOYER_PRIVATE_KEY`
- `BOSSRAID_TOKEN_ADDRESS`
- `BOSSRAID_EVALUATOR_ADDRESS`

Provider registry auth is only needed if you use dynamic provider registration:

- `BOSSRAID_REGISTRY_TOKEN`

Ops client env:

- `VITE_BOSSRAID_OPS_API_BASE`
- `VITE_BOSSRAID_OPS_BASE_PATH`

Web client env:

- `VITE_BOSSRAID_WEB_API_BASE`

Shared frontend proxy target env:

- `VITE_BOSSRAID_API_BASE`

MCP adapter env:

- `BOSSRAID_API_BASE`

MCP workflow:

- `bossraid_delegate` builds a native `POST /v1/raid` request from a private task
- `bossraid_delegate` computes missing file `sha256` values and waits for synthesized output by default
- `bossraid_delegate` returns the `raidAccessToken` needed for later public status and result polling
- `bossraid_receipt` returns live provider state, synthesized output, ranked contribution summary, and settlement proof for a raid
- `bossraid_delegate` automatically retries local HMAC x402 challenges when `BOSSRAID_X402_VERIFY_HMAC_SECRET` is set
- low-level MCP tools remain available for raw spawn, polling, abort, replay, and provider stats
- `bossraid_status`, `bossraid_result`, and `bossraid_receipt` accept `raid_access_token` for public raid reads

x402 env:

- `BOSSRAID_X402_ENABLED`
- `BOSSRAID_X402_FACILITATOR_URL`
- `BOSSRAID_X402_NETWORK`
- `BOSSRAID_X402_ASSET`
- `BOSSRAID_X402_ASSET_NAME`
- `BOSSRAID_X402_ASSET_VERSION`
- `BOSSRAID_X402_PAY_TO`
- `BOSSRAID_X402_RAID_PRICE_USD`
- `BOSSRAID_X402_CHAT_PRICE_USD`
- `BOSSRAID_X402_MAX_TIMEOUT_SECONDS`
- `BOSSRAID_X402_RESOURCE_BASE_URL`
- `BOSSRAID_X402_VERIFY_HMAC_SECRET`
- `PAYAI_API_KEY_ID`
- `PAYAI_API_KEY_SECRET`
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`

x402 E2E test env:

- `BOSSRAID_X402_E2E_MODE`
- `BOSSRAID_X402_E2E_ROUTE`
- `BOSSRAID_X402_E2E_API_BASE`
- `BOSSRAID_X402_BUYER_PRIVATE_KEY`
- `EVM_PRIVATE_KEY`

Evaluator E2E test env:

- `BOSSRAID_EVAL_E2E_SOCKET`
- `BOSSRAID_EVAL_E2E_URL`
- `BOSSRAID_EVAL_E2E_TOKEN`

Evaluator sandbox env:

- `BOSSRAID_EVAL_MAX_CONCURRENT_JOBS`
- `BOSSRAID_EVAL_MAX_FILES`
- `BOSSRAID_EVAL_MAX_TOTAL_BYTES`
- `BOSSRAID_EVAL_MAX_FILE_BYTES`
- `BOSSRAID_EVAL_MAX_PATH_LENGTH`
- `BOSSRAID_EVAL_JOB_CONTAINER_TMPFS_MB`
- `BOSSRAID_EVAL_JOB_CONTAINER_MEMORY_MB`
- `BOSSRAID_EVAL_JOB_CONTAINER_CPUS`
- `BOSSRAID_EVAL_JOB_CONTAINER_PIDS_LIMIT`

Compose helper env:

- `BOSSRAID_DOCKER_SOCKET_SOURCE`
- `BOSSRAID_DOCKER_SOCKET_GID`

## Commands

```bash
pnpm dev
pnpm dev:api
pnpm dev:evaluator
pnpm dev:web
pnpm dev:ops
pnpm dev:mcp
pnpm dev:providers
pnpm dev:video
pnpm demo:rehearse
pnpm serve:gateway
pnpm docker:build
pnpm docker:up
pnpm docker:down
pnpm eigencompute:build
pnpm eigencompute:build-job
pnpm game-raid:build-payload -- --help
pnpm verify:attestation -- --help
pnpm test:evaluator:e2e
pnpm test:mcp:e2e
pnpm build:video
pnpm render:video
pnpm test:game-raid:e2e
pnpm test:x402:e2e -- --help
pnpm settle:raid -- --latest-final
pnpm deploy:contracts
pnpm bootstrap:settlement-env
pnpm bootstrap:onchain
```

## Native Request

Use `POST /v1/raid`.

Current request shape:

- `agent`
- `taskType`
- `task`
- `output`
- `raidPolicy`
- `hostContext`

Current behavior:

- this is the native typed orchestration route
- the caller supplies the task object directly, including files, failing signals, and explicit output requirements
- the route returns a raid handle immediately with `raidId`, `raidAccessToken`, `receiptPath`, and execution estimates
- use the raid read routes or `/receipt` to fetch live status, final result, routing proof, and settlement proof later

## Chat Compatibility

`POST /v1/chat/completions` is now implemented.

Current behavior:

- plain chat messages now work without `raid_request`
- `raid_policy` carries the required payout budget plus optional routing overrides
- optional `raid_request` still overrides the synthesized text raid
- it is still a compatibility wrapper over the same native raid engine
- the default synthesized chat flow is a two-provider text synthesis raid over one shared prompt
- the API converts chat messages into a text-first analysis raid with no attached files
- chat callers must send `raid_policy.max_total_cost`
- `raid_policy.max_agents` expands chat into a broader multi-provider synthesis raid and can trigger deeper internal child raids when the graph needs more structure
- provider task packages now carry explicit sub-role instructions for each invited provider
- the route waits briefly for synthesized output and returns it inline in an OpenAI-compatible `choices` envelope
- the response now includes `raid.raid_access_token` for later public status and result polling
- it returns the synthesized output when present, otherwise the current provider explanation
- this route uses `402` with `PAYMENT-REQUIRED` and accepts `PAYMENT-SIGNATURE` unless `BOSSRAID_X402_ENABLED=false`

## Choosing The Route

- use `POST /v1/chat/completions` when the caller already speaks the OpenAI chat format, the task is prompt-in and text-out, and the best UX is one synthesized answer returned inline
- use `POST /v1/raid` when the caller has a real task package with files, failing signals, framework or language context, patch-style work, or any need for an explicit output contract and later proof reads
- keep both because chat is the low-friction adoption surface and raid is the native control surface; removing chat raises integration friction, while removing raid forces file-backed and patch-backed work through a weaker prompt envelope

Examples:

- chat synthesis example: [examples/chat-completion-request.json](/Users/area/Desktop/boss-raid/examples/chat-completion-request.json)
- native raid patch example: [examples/unity-bug/task.json](/Users/area/Desktop/boss-raid/examples/unity-bug/task.json)
- native game raid example: [examples/game-raid/native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/native-raid.json)
- strict-private native game raid example: [examples/game-raid/private-native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/private-native-raid.json)
- Claude Code or Codex game delegate example: [examples/game-raid/delegate-input.json](/Users/area/Desktop/boss-raid/examples/game-raid/delegate-input.json)
- strict-private incident raid example: [examples/strict-private-raid.json](/Users/area/Desktop/boss-raid/examples/strict-private-raid.json)

One important edge:

- `POST /v1/chat/completions` returns an OpenAI-style answer plus raid metadata
- `POST /v1/raid` returns a spawn handle, not the final answer
- the optional chat `raid_request` override uses the same compact native `POST /v1/raid` request shape, including `task`, `output`, and `raidPolicy.maxTotalCost`

## x402

Paid public routes can now return:

- `402 Payment Required`
- `PAYMENT-REQUIRED`
- `PAYMENT-SIGNATURE`
- `PAYMENT-RESPONSE`
- `X-BOSSRAID-LAUNCH-RESERVATION`

`POST /v1/raid` and `POST /v1/chat/completions` now reserve provider capacity before issuing a payment challenge. If no provider can run the job, the API returns `409` and does not charge. The paid retry must present the same launch reservation context, either through `X-BOSSRAID-LAUNCH-RESERVATION` or an equivalent `reservationId` embedded in the payment payload.

PayAI is now the default facilitator when x402 is active and `BOSSRAID_X402_VERIFY_HMAC_SECRET` is not set:

- `https://facilitator.payai.network`
- `PAYAI_API_KEY_ID`
- `PAYAI_API_KEY_SECRET`

Coinbase CDP remains optional:

- `BOSSRAID_X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402`
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`

For Base networks, `BOSSRAID_X402_ASSET=usdc` now expands to real USDC token metadata automatically:

- Base Sepolia `eip155:84532`
- Base mainnet `eip155:8453`

For unsupported EVM networks or custom ERC-20 tokens, set:

- `BOSSRAID_X402_ASSET=<token-address>`
- `BOSSRAID_X402_ASSET_NAME`
- `BOSSRAID_X402_ASSET_VERSION`

Local development can still use the HMAC verifier fallback via `BOSSRAID_X402_VERIFY_HMAC_SECRET`.

The public x402 amount is now:

- provider payout budget from the request
- plus the route surcharge from `BOSSRAID_X402_RAID_PRICE_USD` or `BOSSRAID_X402_CHAT_PRICE_USD`

Public write routes now require an explicit payout budget:

- `POST /v1/raid`: `raidPolicy.maxTotalCost`
- `POST /v1/chat/completions`: `raid_policy.max_total_cost`

## End-to-End Testing

Use the built-in rehearsal command:

```bash
pnpm test:x402:e2e -- --mode hmac --route raid
pnpm test:x402:e2e -- --mode wallet --route raid
```

Expected behavior:

- first request returns `402` with `PAYMENT-REQUIRED` plus `X-BOSSRAID-LAUNCH-RESERVATION`
- the paid retry returns `200` with `PAYMENT-RESPONSE`
- if no provider is eligible, the first request returns `409` instead of `402`

Detailed instructions live in:

- [docs/end-to-end-testing.md](/Users/area/Desktop/boss-raid/docs/end-to-end-testing.md)

## Docker, Phala, And EigenCompute

Container packaging now lives in:

- [Dockerfile](/Users/area/Desktop/boss-raid/Dockerfile)
- [Dockerfile.eigencompute](/Users/area/Desktop/boss-raid/Dockerfile.eigencompute)
- [docker-compose.yml](/Users/area/Desktop/boss-raid/docker-compose.yml)
- [deploy/phala/docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/docker-compose.yml)
- [deploy/phala/providers-only.docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/providers-only.docker-compose.yml)
- [deploy/phala/.env.example](/Users/area/Desktop/boss-raid/deploy/phala/.env.example)
- [deploy/phala/providers-only.env.example](/Users/area/Desktop/boss-raid/deploy/phala/providers-only.env.example)
- [deploy/eigencompute/.env.example](/Users/area/Desktop/boss-raid/deploy/eigencompute/.env.example)
- [docs/phala-deployment.md](/Users/area/Desktop/boss-raid/docs/phala-deployment.md)
- [docs/eigencompute-deployment.md](/Users/area/Desktop/boss-raid/docs/eigencompute-deployment.md)

## Pricing And Payouts

Provider payout behavior and settlement fee notes live in:

- [docs/pricing-and-payouts.md](/Users/area/Desktop/boss-raid/docs/pricing-and-payouts.md)

## Provider Registry

Routes:

- `POST /agents/register`
- `POST /agents/heartbeat`
- `GET /agents/discover`

Write routes require:

- `Authorization: Bearer $BOSSRAID_REGISTRY_TOKEN`

Example registration payload:

- [examples/provider-registration.json](/Users/area/Desktop/boss-raid/examples/provider-registration.json)

Discovery returns fresh providers by default.

Only `available` providers are routable.

Providers that stop heartbeating are marked `degraded` and drop out of routing.

## Key Files

- public app: [apps/web/src/App.tsx](/Users/area/Desktop/boss-raid/apps/web/src/App.tsx)
- ops app: [apps/ops/src/App.tsx](/Users/area/Desktop/boss-raid/apps/ops/src/App.tsx)
- env example: [.env.example](/Users/area/Desktop/boss-raid/.env.example)
- provider manifest: [examples/providers.http.json](/Users/area/Desktop/boss-raid/examples/providers.http.json)
- provider registration example: [examples/provider-registration.json](/Users/area/Desktop/boss-raid/examples/provider-registration.json)
- chat completion example: [examples/chat-completion-request.json](/Users/area/Desktop/boss-raid/examples/chat-completion-request.json)
- native raid example: [examples/unity-bug/task.json](/Users/area/Desktop/boss-raid/examples/unity-bug/task.json)
- strict-private native game raid example: [examples/game-raid/private-native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/private-native-raid.json)
- strict-private incident raid example: [examples/strict-private-raid.json](/Users/area/Desktop/boss-raid/examples/strict-private-raid.json)
- provider address map: [examples/provider-addresses.json](/Users/area/Desktop/boss-raid/examples/provider-addresses.json)

## Docs

- public docs: [boss-raid-docs.pages.dev](https://boss-raid-docs.pages.dev)
- bridge architecture doc: [docs/architecture.md](/Users/area/Desktop/boss-raid/docs/architecture.md)
- bridge interfaces doc: [docs/interfaces.md](/Users/area/Desktop/boss-raid/docs/interfaces.md)
- bridge runtime doc: [docs/runtime.md](/Users/area/Desktop/boss-raid/docs/runtime.md)
- bridge ui doc: [docs/ui.md](/Users/area/Desktop/boss-raid/docs/ui.md)
- bridge hackathon doc: [docs/hackathon.md](/Users/area/Desktop/boss-raid/docs/hackathon.md)
- release rehearsal doc: [docs/end-to-end-testing.md](/Users/area/Desktop/boss-raid/docs/end-to-end-testing.md)
- pricing and payout doc: [docs/pricing-and-payouts.md](/Users/area/Desktop/boss-raid/docs/pricing-and-payouts.md)
- bridge registration doc: [docs/synthesis-registration.md](/Users/area/Desktop/boss-raid/docs/synthesis-registration.md)
- submission plan: [docs/synthesis-submission-plan.md](/Users/area/Desktop/boss-raid/docs/synthesis-submission-plan.md)
- submission copy: [docs/synthesis-submission-copy.md](/Users/area/Desktop/boss-raid/docs/synthesis-submission-copy.md)

## Hackathon

- event: SYNTHESIS 2026
- track: [Virtuals Digital S.A. ERC-8183 Open Build](https://synthesis.md/hack/#virtuals-digital-s-a)
- registration skill: [skill.md](https://synthesis.md/skill.md)
