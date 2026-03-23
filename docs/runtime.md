# Runtime

Canonical public docs now live at:

- [Quick Start](https://boss-raid-docs.pages.dev/docs/getting-started/quick-start)
- [Local Development](https://boss-raid-docs.pages.dev/docs/getting-started/local-development)
- [Runtime And Environment](https://boss-raid-docs.pages.dev/docs/operations/runtime-and-environment)
- [Persistence And State](https://boss-raid-docs.pages.dev/docs/operations/persistence-and-state)
- [Settlement And Contracts](https://boss-raid-docs.pages.dev/docs/operations/settlement-and-contracts)
- [Troubleshooting](https://boss-raid-docs.pages.dev/docs/operations/troubleshooting)

## Monorepo Note

This file is now a bridge doc inside the app repo.

Keep it updated if the external docs URL changes or the runtime command surface changes.

## Current Truth

- `pnpm dev` starts the evaluator, API, web, ops, and local providers
- `pnpm dev:providers` reads the active `BOSSRAID_PROVIDERS_FILE`, infers provider mode from the provider profile, and injects per-agent Venice credentials when those env vars are present or when the provider profile sets `modelApiKeyEnv`
- `examples/providers.eigencompute.json` now accepts `BOSSRAID_PROVIDER_A_ENDPOINT`, `BOSSRAID_PROVIDER_B_ENDPOINT`, and `BOSSRAID_PROVIDER_C_ENDPOINT` overrides so the EigenCompute control plane can route to remote HTTP providers without changing the image
- `pnpm serve:gateway` serves the built web app at `/`, the built ops app at `/ops/`, and same-origin API proxies at `/api` and `/ops-api`
- `pnpm docker:build` builds the local app runtime image, the evaluator launcher image, and the disposable evaluator job image
- `pnpm docker:up` boots the full local container stack from `docker-compose.yml`, auto-detects the local Docker socket path for evaluator job isolation, and prebuilds the evaluator job image when needed
- `pnpm docker:down` stops that stack
- `pnpm acp-seller:env:export` exports the `Gamma`, `Riko`, and `Dottie` ACP API keys from the local ACP config into `temp/acp-sellers.phala.env`
- `pnpm acp-seller:docker:build` stages a sanitized ACP seller build context from `temp/openclaw-acp-work` and builds the shared ACP runtime image for `Gamma`, `Riko`, and `Dottie`, including `ffmpeg` for `Riko` preview renders
- `pnpm eigencompute:build` builds the single EigenCompute image from [Dockerfile.eigencompute](/Users/area/Desktop/boss-raid/Dockerfile.eigencompute)
- `pnpm eigencompute:build-job` builds the optional EigenCompute evaluator job image from [Dockerfile.eigencompute](/Users/area/Desktop/boss-raid/Dockerfile.eigencompute)
- `pnpm game-raid:build-payload -- --repo /path/to/game --file project.gbsproj --file scripts/game.ts --title "Boss Raid: Slime Panic"` builds a repo-specific native game raid payload, delegate payload, and provider submission templates under `temp/game-raid-payload`
- `pnpm test:game-raid:e2e` builds the repo, starts the compiled API plus the compiled `Gamma`, `Dottie`, and `Riko` Boss Raid HTTP providers, posts the native game raid example to `POST /v1/raid`, and verifies one final Mercenary synthesis with patch, image, video, bundle, and routing proof
- `pnpm test:private-game-raid:e2e` builds the repo, starts the compiled API plus the compiled `Gamma`, `Dottie`, and `Riko` Boss Raid HTTP providers, posts the strict-private game raid example to `POST /v1/raid`, and verifies one final Mercenary synthesis with patch, image, video, bundle, and Venice-only routing proof
- `pnpm test:strict-private:e2e` builds the repo, starts the compiled API plus the compiled strict-private analyst provider pool, posts the strict-private incident raid example to `POST /v1/raid`, and verifies Venice-only routing proof, ERC-8004 gating, and the public `agent_log.json` proof path
- `pnpm verify:attestation` verifies a `GET /v1/attested-runtime` or `GET /v1/raid/:raidId/attested-result` envelope from stdin or `--file`
- `pnpm demo:rehearse` runs `check`, `build`, core tests, boots the local stack, and rehearses HMAC raid/chat/MCP flows
- `pnpm dev:video` starts the Remotion studio for the Boss Raid promo composition
- `pnpm build:video` bundles the Remotion video app
- `pnpm render:video` renders the Boss Raid and Mercenary promo to `temp/video/boss-raid-mercenary.mp4`
- the public action route is `POST /v1/raid`
- local default persistence is SQLite
- `pnpm dev:mcp` starts the stateless MCP adapter over the same API state
- the MCP adapter now exposes `bossraid_delegate` and `bossraid_receipt` for host-agent workflows
- `bossraid_delegate` computes missing file hashes and waits for synthesized output unless `waitForResult=false`
- Mercenary now assigns explicit workstreams and sub-roles authored from the request itself, then fans multi-expert raids into internal child raids before provider dispatch and keeps decomposing overloaded scopes through recursive workstream families
- game-shaped raids now route through explicit gameplay, pixel-art, and video-marketing workstreams so provider registration can target the right branch before deeper nested decomposition
- the shipped game-specialist manifests no longer advertise generic incident-analysis capability; use the dedicated strict-private analyst pool for incident review and the private game raid payload for the hosted game demo privacy lane
- the local Boss Raid game providers now generate real artifacts on the HTTP provider path:
  - `Gamma` emits a gameplay patch and starter project bundle for small game-development slices
  - `Dottie` emits PNG sprites, a spritesheet, and metadata
  - `Riko` emits storyboard frames, captions, a promo bundle, and preview video output
- Mercenary's verified execution lane is still the Boss Raid HTTP provider registry; ACP seller runtimes remain a separate marketplace path unless an explicit bridge provider is added
- the ACP seller runtimes now generate inline artifact bundles instead of returning planning-only briefs:
  - `Gamma` emits a gameplay starter project scaffold with live assets
  - `Riko` emits storyboard frames, captions, a source bundle, and a preview MP4 when `ffmpeg` is available
  - `Dottie` emits PNG sprites, a spritesheet, and metadata
- larger hierarchical raids now hold back a small adaptive reserve so Mercenary can revise the active graph with repair leaves or deeper expansion branches before the parent raid settles
- child raids, adaptive repair raids, and adaptive expansion raids now inherit the root raid deadline instead of getting fresh timeout windows
- native raid requests, chat `raid_policy`, and provider discovery can now require registered ERC-8004 providers and minimum trust scores
- `bossraid_delegate` automatically retries local HMAC x402 challenges when `BOSSRAID_X402_VERIFY_HMAC_SECRET` is set
- `pnpm test:mcp:e2e` runs the MCP host-agent smoke against the running API
- `pnpm test:evaluator:e2e` runs a real Node built-in test suite through the evaluator service
- `pnpm test:x402:e2e` runs the paid-route rehearsal flow against the running API
- `pnpm --filter @bossraid/api-contracts test` runs the shared request-builder contract tests
- the public web frames Boss Raid as a private tool surface rather than a public operator console
- the public web now includes `/receipt`, a capability-linked proof page for one raid at a time
- the public proof surface now also includes `GET /v1/agent.json` and token-gated per-raid `agent_log.json`
- `GET /v1/agent.json` now exposes Mercenary ERC-8004 identity state plus live provider-pool trust counts
- strict privacy routing now prefers Venice-backed providers when that lane is available
- Venice-backed Boss Raid HTTP providers now use Venice's documented OpenAI-compatible `chat/completions` path at `https://api.venice.ai/api/v1` instead of the OpenAI `responses` route
- the container topology now runs a single public gateway in front of the API and provider services
- the container stacks now run a private evaluator service for real runtime probes over a shared Unix socket
- ops now exposes a raid receipt view with synthesized output, ranked submissions, settlement proof, and reputation events
- the public receipt page uses the same raid status and result reads with `x-bossraid-raid-token` instead of an ops session
- per-raid `agent_log.json` reads accept the raid access token as either `x-bossraid-raid-token` or a `token` query parameter for file-style proof links
- internal control routes now accept `Authorization: Bearer $BOSSRAID_ADMIN_TOKEN` for automation and an HTTP-only ops session for the ops UI
- `POST /v1/ops/session` now mints the ops session cookie
- `GET /v1/runtime` reports deploy posture, evaluator safety flags, and mounted TEE socket state for internal ops
- `POST /v1/runtime/evaluator-smoke` runs the evaluator smoke task through the configured runtime transport and is intended for admin-only deploy verification
- `GET /v1/attested-runtime` returns a public TEE-wallet-signed runtime proof when `MNEMONIC` is present
- `GET /v1/raid/:raidId/attested-result` returns a TEE-wallet-signed proof over the current raid result and requires the raid access token unless the caller is admin-authenticated
- native raid spawn responses now include `raidAccessToken`, and public raid status/result reads require `x-bossraid-raid-token`
- native raid spawn responses now also include `receiptPath` so the public proof page can be opened directly from the spawn result
- native raid status/result reads now expose `adaptivePlanning` for parent raids when Mercenary reserved experts or revised the graph
- native raid result and agent-log reads now expose `routingProof` so receipts can show Venice lane use, ERC-8004 gating, registration references, and per-provider routing reasons
- native raid result, receipt, and agent-log proof now expose ERC-8183-aligned settlement details through `settlementExecution.proofStandard`, `contracts`, `registryCall`, and `childJobs`
- provider registry writes require `Authorization: Bearer $BOSSRAID_REGISTRY_TOKEN`
- public provider list and health routes now strip auth material and private diagnostics
- public provider and raider surfaces now expose provider `erc8004` identity metadata and `trust` metadata
- provider workers now require explicit bearer or hmac auth unless local development opts into `BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH=1`
- web now defaults to `/api` and ops now defaults to `/ops-api`, both intended for same-origin proxying
- x402 is enabled by default on paid public routes and uses `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` unless `BOSSRAID_X402_ENABLED=false`
- unpaid paid-route challenges now also return `X-BOSSRAID-LAUNCH-RESERVATION`
- paid public routes now reserve provider capacity before returning `402`, then require the same launch reservation on the paid retry
- PayAI is the default facilitator when x402 is active without a local HMAC secret
- PayAI merchant auth uses `PAYAI_API_KEY_ID` and `PAYAI_API_KEY_SECRET`
- Coinbase CDP remains optional via `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`
- Base Sepolia and Base mainnet can use `BOSSRAID_X402_ASSET=usdc` without extra token metadata env
- x402 does not require `BOSSRAID_RPC_URL`; `BOSSRAID_RPC_URL` is only required for contract deployment and `BOSSRAID_SETTLEMENT_MODE=onchain`
- paid route charges now include the request payout budget plus the route surcharge env
- default chat synthesis is a two-provider text raid and still requires `raid_policy.max_total_cost`
- native raid requests require `raidPolicy.maxTotalCost`
- local x402 smoke tests can use `BOSSRAID_X402_VERIFY_HMAC_SECRET`
- ops session TTL is controlled by `BOSSRAID_OPS_SESSION_TTL_SEC`
- `BOSSRAID_API_HOST` controls the API bind host
- `BOSSRAID_DEPLOY_TARGET` labels the current deployment environment for diagnostics
- `BOSSRAID_GATEWAY_HOST` controls the public gateway bind host
- `BOSSRAID_API_ORIGIN` controls where the gateway proxies `/api` and `/ops-api`
- `BOSSRAID_CALLBACK_BASE` can target a gateway API prefix such as `http://<public-ip>:8080/api`; provider callbacks preserve that base path when building `/v1/providers/*` callback URLs
- API body size is capped by `BOSSRAID_API_BODY_LIMIT_BYTES`
- public action rate limiting is controlled by `BOSSRAID_PUBLIC_RATE_LIMIT_MAX` and `BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS`
- ops session login rate limiting is controlled by `BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX` and `BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS`
- `BOSSRAID_TRUST_PROXY=true` lets Fastify honor forwarded client IPs for rate limiting behind a trusted proxy
- provider health probes now time out via `BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS`
- `BOSSRAID_PROVIDER_AUTH_TYPE` selects bearer, hmac, or explicit local-only `none` ingress auth
- `BOSSRAID_PROVIDER_TOKEN` carries bearer ingress auth for provider workers
- `BOSSRAID_PROVIDER_SECRET` carries hmac ingress auth for provider workers
- `BOSSRAID_CALLBACK_AUTH_TYPE` selects bearer, hmac, or explicit local-only `none` callback auth
- `BOSSRAID_CALLBACK_TOKEN` carries bearer callback auth back into Mercenary
- `BOSSRAID_CALLBACK_SECRET` carries hmac callback auth back into Mercenary
- `BOSSRAID_EVAL_SANDBOX_MODE=socket` routes runtime probes to the private evaluator service over a shared Unix socket instead of the API container
- `BOSSRAID_EVAL_SANDBOX_SOCKET` points the API at the evaluator socket path
- `BOSSRAID_EVAL_SANDBOX_URL` remains available for standalone HTTP evaluator setups
- `BOSSRAID_EVAL_SANDBOX_TOKEN` authenticates API-to-evaluator probe requests
- `BOSSRAID_EVAL_SANDBOX_TIMEOUT_MS` controls the API-to-evaluator request timeout
- `BOSSRAID_EVAL_JOB_ISOLATION=container` switches the evaluator from in-process workers to disposable per-job containers
- `BOSSRAID_IMAGE` selects the shared gateway/API/provider image in compose deployments
- `BOSSRAID_EVALUATOR_IMAGE` selects the long-lived evaluator service image in compose deployments
- `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE` selects the image used for disposable evaluator job containers
- `BOSSRAID_EVAL_DOCKER_SOCKET_PATH` points the evaluator launcher at the mounted Docker socket
- `BOSSRAID_EVAL_SOCKET_PATH` controls the evaluator Unix socket listener path
- `BOSSRAID_EVAL_HOST` controls the evaluator TCP bind host when socket mode is not used
- `BOSSRAID_EVAL_BODY_LIMIT_BYTES` controls the evaluator request body cap
- `BOSSRAID_EVAL_JOB_TIMEOUT_MS` caps the lifetime of each short-lived evaluator worker process
- `BOSSRAID_EVAL_JOB_CONTAINER_TMPFS_MB`, `BOSSRAID_EVAL_JOB_CONTAINER_MEMORY_MB`, `BOSSRAID_EVAL_JOB_CONTAINER_CPUS`, and `BOSSRAID_EVAL_JOB_CONTAINER_PIDS_LIMIT` set the disposable job-container limits
- `BOSSRAID_EVAL_MAX_CONCURRENT_JOBS` caps concurrent evaluator jobs before it returns `503`
- `BOSSRAID_EVAL_MAX_FILES` caps how many files a runtime probe can materialize
- `BOSSRAID_EVAL_MAX_TOTAL_BYTES` caps total runtime probe file content bytes
- `BOSSRAID_EVAL_MAX_FILE_BYTES` caps the size of any single runtime probe file
- `BOSSRAID_EVAL_MAX_PATH_LENGTH` caps the byte length of each runtime probe path
- `BOSSRAID_PROVIDER_HOST` controls the provider bind host
- `BOSSRAID_PROVIDER_MODE` selects `generic`, `gbstudio`, `pixel_art`, or `remotion` behavior inside the HTTP provider runtime
- the default shipped provider ids are `dottie`, `riko`, and `gamma`
- `BOSSRAID_MODEL_API_BASE` controls the OpenAI-compatible base URL used by the HTTP provider runtime
- `BOSSRAID_MODEL_REASONING_EFFORT` controls the structured planning effort sent by the HTTP provider runtime
- `BOSSRAID_MODEL_TIMEOUT_MS` caps one HTTP provider model request
- `BOSSRAID_MAX_OUTPUT_TOKENS` caps one HTTP provider model response budget
- `BOSSRAID_HARD_EXECUTION_MS` caps one provider execution window inside a raid and the game raid smoke defaults it to `85000`
- `BOSSRAID_X402_PAY_TO` is the x402 payment receiver address and can be different from the settlement client, deployer, evaluator, and provider addresses
- `BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH=1` allows unauthenticated provider ingress and callback traffic for local development only
- `BOSSRAID_VENICE_API_BASE` and `BOSSRAID_VENICE_MODEL` default the local Boss Raid game-provider launcher to Venice when a per-agent key is present
- `VENICE_API_KEY_GAMMA`, `VENICE_API_KEY_RIKO`, and `VENICE_API_KEY_DOTTIE` enable Venice-backed execution for the matching local Boss Raid game providers and also power the matching ACP seller runtimes
- `BOSSRAID_ACP_REPO_PATH` selects the local ACP workspace used for ACP seller image builds and defaults to `temp/openclaw-acp-work`
- `BOSSRAID_ACP_CONFIG_PATH` selects the ACP `config.json` source used when exporting the secret Phala seller env file
- `BOSSRAID_ACP_SELLER_CONTEXT_OUT` selects the staged ACP seller Docker build context path and defaults to `temp/acp-seller-build`
- `BOSSRAID_ACP_SELLER_ENV_OUT` selects the ACP seller Phala env output path and defaults to `temp/acp-sellers.phala.env`
- `BOSSRAID_ACP_SELLER_IMAGE` selects the shared ACP seller container tag used for build output and Phala deployment
- `BOSSRAID_ACP_SELLER_PLATFORM` selects the target Docker build platform for the ACP seller image and defaults to `linux/amd64`
- `VENICE_API_KEY_GAMMA`, `VENICE_API_KEY_RIKO`, and `VENICE_API_KEY_DOTTIE` enable Venice-backed structured planning inside the matching ACP seller handlers
- `VENICE_API_BASE` defaults the ACP seller runtime to `https://api.venice.ai/api/v1`
- `VENICE_MODEL` sets the default Venice model for all ACP sellers unless a per-agent override is set and defaults to `minimax-m27`
- `VENICE_MODEL_GAMMA`, `VENICE_MODEL_RIKO`, and `VENICE_MODEL_DOTTIE` override the Venice model per ACP seller and default to `minimax-m27` in the exported Phala env
- `VENICE_REASONING_EFFORT` sets the Venice reasoning effort for ACP seller planning requests
- `ACP_DISABLE_CONFIG_WRITES=1` disables ACP `config.json` writes for read-only container deployments like the Phala seller runtime
- `BOSSRAID_ERC8004_AGENT_ID`, `BOSSRAID_ERC8004_OPERATOR_WALLET`, `BOSSRAID_ERC8004_REGISTRATION_TX`, `BOSSRAID_ERC8004_IDENTITY_REGISTRY`, `BOSSRAID_ERC8004_REPUTATION_REGISTRY`, `BOSSRAID_ERC8004_VALIDATION_REGISTRY`, `BOSSRAID_ERC8004_VALIDATION_TXS`, and `BOSSRAID_ERC8004_LAST_VERIFIED_AT` populate the live Mercenary ERC-8004 manifest and proof surfaces
- `BOSSRAID_CLIENT_PRIVATE_KEY` is the hot wallet key that signs parent-raid and child-job settlement txs when `BOSSRAID_SETTLEMENT_MODE=onchain`
- `BOSSRAID_EVALUATOR_ADDRESS` is the onchain address recorded on every child job as the evaluator allowed to judge or finalize that job
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON` maps each provider id to the real onchain address used for ERC-8183-aligned child-job creation and proof
- `BOSSRAID_TEE_PLATFORM` labels the active TEE vendor for diagnostics
- `BOSSRAID_TEE_SOCKET_PATH` points the API runtime diagnostics at the mounted TEE socket path
- `MNEMONIC` enables the attested runtime and attested raid result proof routes and is injected automatically by EigenCompute
- `BOSSRAID_API_PORT` controls the internal API port used by the EigenCompute single-container supervisor
- `BOSSRAID_EVAL_PORT` controls the internal evaluator port used by the EigenCompute single-container supervisor
- `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE` selects the optional companion image used when the EigenCompute container switches to disposable job-container isolation
- `BOSSRAID_EVAL_DOCKER_SOCKET_PATH` points the EigenCompute container at a mounted Docker-compatible socket for optional job-container isolation
- `BOSSRAID_WEB_DIST_DIR` and `BOSSRAID_OPS_DIST_DIR` let the gateway serve non-default build output locations
- evaluator defaults to offline static/proxy scoring and only runs repo-native build/test probes when `BOSSRAID_EVAL_RUNTIME_EXECUTION=true`
- production still blocks host-side runtime probes unless `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION=true` is also set
- runtime probe requests now reject path traversal, duplicate paths, unknown touched files, and oversize workspaces before execution
- the runtime images now run as a dedicated non-root user
- the EigenCompute image intentionally runs as root because EigenCompute existing-image deployments require a root-run `linux/amd64` Dockerfile
- the shipped compose stacks now default the gateway, API, evaluator, and provider services to read-only root filesystems, tmpfs `/tmp`, dropped Linux caps, and `no-new-privileges`
- the isolated evaluator container uses a dedicated launcher image plus those defaults, `network_mode: none`, a shared socket volume, disposable per-job containers by default in the shipped compose path, explicit concurrency limits, and a larger tmpfs workspace
- the EigenCompute image runs one supervisor process that starts the gateway, API, evaluator, and loopback-only provider agents inside one TEE container
- the EigenCompute image can also switch the evaluator to disposable job-container isolation when the environment mounts a Docker-compatible socket into that same container
- the admin-only evaluator smoke route can verify that live EigenCompute deploys are actually executing the isolated evaluator path without needing a full provider run
- `VITE_BOSSRAID_OPS_BASE_PATH` controls the built ops app mount path and defaults to `/ops/`
- long-lived services now trap `SIGINT` and `SIGTERM` for clean container shutdowns

```bash
pnpm serve:gateway
pnpm docker:build
pnpm docker:up
pnpm docker:down
pnpm acp-seller:env:export
pnpm acp-seller:docker:build
pnpm eigencompute:build
pnpm eigencompute:build-job
pnpm game-raid:build-payload -- --help
pnpm verify:attestation -- --help
pnpm dev:evaluator
pnpm dev:video
pnpm build:video
pnpm render:video
pnpm test:game-raid:e2e
pnpm demo:rehearse
pnpm test:evaluator:e2e
pnpm --filter @bossraid/api-contracts test
pnpm test:mcp:e2e
pnpm test:x402:e2e -- --mode hmac --route raid
pnpm test:x402:e2e -- --mode wallet --route raid
pnpm deploy:contracts
pnpm bootstrap:settlement-env
pnpm bootstrap:onchain
```

See [docs/end-to-end-testing.md](/Users/area/Desktop/boss-raid/docs/end-to-end-testing.md) for the full release rehearsal flow.
See [docs/pricing-and-payouts.md](/Users/area/Desktop/boss-raid/docs/pricing-and-payouts.md) for payout and fee guidance.
See [docs/phala-deployment.md](/Users/area/Desktop/boss-raid/docs/phala-deployment.md) for the multi-image Docker and Phala CVM path.
See [docs/acp-seller-phala-deployment.md](/Users/area/Desktop/boss-raid/docs/acp-seller-phala-deployment.md) for the separate Phala deployment path for the ACP seller runtimes.
See [docs/eigencompute-deployment.md](/Users/area/Desktop/boss-raid/docs/eigencompute-deployment.md) for the single-container EigenCompute path.
See [docs/synthesis-proof-runbook.md](/Users/area/Desktop/boss-raid/docs/synthesis-proof-runbook.md) for the judge-proof execution order across ERC-8183, ERC-8004, and Venice.
See [examples/base-mainnet-proof.env.example](/Users/area/Desktop/boss-raid/examples/base-mainnet-proof.env.example) for a final-lane Base mainnet env template.
See [docs/virtuals-acp-bossraid-mapping.md](/Users/area/Desktop/boss-raid/docs/virtuals-acp-bossraid-mapping.md) for the Virtuals ACP registration mapping into Boss Raid env and provider records.
See [docs/base-mainnet-demo-checklist.md](/Users/area/Desktop/boss-raid/docs/base-mainnet-demo-checklist.md) for the operator checklist across ACP, provider registration, settlement, and proof capture.

## Settlement Tooling

Run:

- `pnpm settle:raid -- --raid-id <id>`
- `pnpm settle:raid -- --latest-final`
- `pnpm settle:raid -- --latest-final --sqlite-file ./temp/bossraid-state.sqlite`

Settle parent raids only. Child raids, including nested child raids, are internal workstream runs and do not produce independent settlement records.

## Current Limits

- public API is raid-oriented by design
- privacy metadata, reputation metadata, and computed scores are separate fields, but not fully separate systems yet
- SQLite is the default persisted backend, but D1 is not wired yet
- provider selection is still tuned for the older task model outside the dedicated game-workstream family
- evaluation still falls back to deterministic regression proxies when no safe repo-native test path can be inferred
