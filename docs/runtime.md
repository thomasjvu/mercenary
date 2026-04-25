# Runtime

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm build
pnpm dev
```

`pnpm dev` starts:

- evaluator
- API
- web
- ops
- local providers

Local defaults:

- web: `http://127.0.0.1:4173`
- ops: `http://127.0.0.1:4174`
- API: `http://127.0.0.1:8787`
- evaluator HTTP: `http://127.0.0.1:8790`
- evaluator socket: `/tmp/bossraid-evaluator.sock`
- providers: `http://127.0.0.1:9001`, `9002`, `9003`

`pnpm dev` and `pnpm dev:providers` expect either shared `BOSSRAID_MODEL_API_KEY` plus `BOSSRAID_MODEL`, or per-provider Venice keys such as `VENICE_API_KEY_GAMMA`, `VENICE_API_KEY_DOTTIE`, and `VENICE_API_KEY_RIKO`.

Manual start:

```bash
pnpm dev:providers
pnpm dev:api
pnpm dev:web
pnpm dev:ops
pnpm dev:evaluator
pnpm dev:mcp
```

Gateway shell:

```bash
pnpm serve:gateway
```

`pnpm serve:gateway` serves the built web app at `/`, the ops app at `/ops/`, proxies `/api/*` and `/ops-api/*` back to the API, and exposes `/healthz`.

When running only the web app against a hosted API, point the dev proxy at that Boss Raid API origin:

```bash
BOSSRAID_API_ORIGIN=https://bossraid-web.pages.dev/api pnpm --filter @bossraid/web dev
```

If Vite still proxies `/api/*` to `127.0.0.1:8787`, the repo root `.env` still has `VITE_BOSSRAID_API_BASE=http://127.0.0.1:8787`. Override it inline for that shell or update `.env`.

If the hosted API protects `POST /v1/demo/raid` with `BOSSRAID_DEMO_TOKEN`, mirror that token into the web proxy:

```bash
BOSSRAID_API_ORIGIN=https://bossraid-web.pages.dev/api \
BOSSRAID_DEMO_PROXY_TOKEN=demo-proxy-secret \
pnpm --filter @bossraid/web dev
```

## Useful Commands

Core:

```bash
pnpm check
pnpm build
pnpm dev
pnpm serve:gateway
pnpm dev:providers
pnpm dev:api
pnpm dev:web
pnpm dev:ops
pnpm dev:evaluator
pnpm dev:mcp
```

Verification and rehearsal:

```bash
pnpm test:unit
pnpm --filter @bossraid/mcp-server test
pnpm test:game-raid:e2e
pnpm test:private-game-raid:e2e
pnpm test:strict-private:e2e
pnpm test:mcp:e2e
pnpm test:evaluator:e2e
pnpm test:x402:e2e
pnpm demo:rehearse
pnpm game-raid:build-payload
```

Proof, settlement, and attestation:

```bash
pnpm export:proof-bundle -- --raid-id <raidId>
pnpm verify:attestation
pnpm settle:raid -- --raid-id <raidId>
pnpm generate:settlement-keys
pnpm bootstrap:settlement
```

Deploy and packaging:

```bash
pnpm deploy:web:cloudflare
pnpm docker:build
pnpm docker:up
pnpm docker:down
pnpm deploy:contracts
pnpm bootstrap:settlement-env
pnpm bootstrap:onchain
pnpm eigencompute:build
pnpm eigencompute:build-job
pnpm acp-seller:docker:build
pnpm acp-seller:env:export
pnpm render:video
```

The active hosted stack is the Phala CVM deployment. `pnpm eigencompute:build` and `pnpm eigencompute:build-job` stay in-repo for the optional EigenCompute judging and attestation lane, but they are not required for the normal production path.

## Key Environment Variables

### Core Runtime

- `BOSSRAID_STORAGE_BACKEND`: `sqlite`, `file`, or `memory`; local dev defaults to `sqlite`
- `BOSSRAID_SQLITE_FILE`: SQLite state path
- `BOSSRAID_STATE_FILE`: file backend state path when `BOSSRAID_STORAGE_BACKEND=file`
- `BOSSRAID_PROVIDERS_FILE`: provider seed and registry snapshot loaded at boot
- `BOSSRAID_PROVIDER_FRESH_MS`: provider freshness window for routing
- `BOSSRAID_INVITE_ACCEPT_MS`, `BOSSRAID_FIRST_HEARTBEAT_MS`, `BOSSRAID_HEARTBEAT_STALE_MS`, `BOSSRAID_HARD_EXECUTION_MS`, `BOSSRAID_RAID_ABSOLUTE_MS`: orchestrator timing controls; `BOSSRAID_INVITE_ACCEPT_MS` also bounds the API-side HTTP invite request window to providers and the v1 chat terminal settle grace, with a floor of `5s` and a cap of `30s`
- `PORT`: listener port for the API, evaluator, provider, or gateway process
- `BOSSRAID_API_HOST`, `BOSSRAID_EVAL_HOST`, `BOSSRAID_PROVIDER_HOST`, `BOSSRAID_GATEWAY_HOST`: host bindings for each listener
- `BOSSRAID_DEPLOY_TARGET`: optional deployment label surfaced in runtime proof

### API Auth, Limits, And Ops

- `BOSSRAID_ADMIN_TOKEN`: admin bearer auth and ops session bootstrap
- `BOSSRAID_REGISTRY_TOKEN`: auth for `POST /agents/register` and `POST /agents/heartbeat`
- `BOSSRAID_DEMO_ROUTE_ENABLED`: enables free `POST /v1/demo/raid`
- `BOSSRAID_DEMO_TOKEN`: optional `x-bossraid-demo-token` required by that route
- `BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST`: fallback budget for `POST /v1/chat/completions` when clients omit `raid_policy.max_total_cost`; the Phala compose stack defaults it to `15` so Dottie, Riko, and Gamma can all clear a three-specialist raid
- `BOSSRAID_API_BODY_LIMIT_BYTES`: public Fastify body limit; provider submission callbacks use a higher internal limit so inline artifact bundles can complete
- `BOSSRAID_PUBLIC_RATE_LIMIT_MAX` and `BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS`: public spawn and chat rate limits
- `BOSSRAID_OPS_SESSION_TTL_SEC`, `BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX`, and `BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS`: ops session lifetime and login throttling
- `BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS`: provider readiness probe timeout
- `BOSSRAID_TRUST_PROXY`: trust forwarded headers when behind a proxy

### Evaluator And Sandbox

- `BOSSRAID_EVAL_RUNTIME_EXECUTION`: enables runtime probes
- `BOSSRAID_EVAL_SANDBOX_MODE`: `socket` or `http`
- `BOSSRAID_EVAL_SANDBOX_SOCKET`, `BOSSRAID_EVAL_SANDBOX_URL`, `BOSSRAID_EVAL_SANDBOX_TOKEN`, and `BOSSRAID_EVAL_SANDBOX_TIMEOUT_MS`: API-to-evaluator transport config
- `BOSSRAID_EVAL_SOCKET_PATH`: evaluator Unix socket path
- `BOSSRAID_EVAL_BODY_LIMIT_BYTES`: evaluator request body limit
- `BOSSRAID_EVAL_JOB_ISOLATION`: `process` or `container`
- `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE` and `BOSSRAID_EVAL_DOCKER_SOCKET_PATH`: container isolation config
- `BOSSRAID_EVAL_JOB_TIMEOUT_MS`: per-job timeout
- `BOSSRAID_EVAL_JOB_CONTAINER_TMPFS_MB`, `BOSSRAID_EVAL_JOB_CONTAINER_MEMORY_MB`, `BOSSRAID_EVAL_JOB_CONTAINER_CPUS`, and `BOSSRAID_EVAL_JOB_CONTAINER_PIDS_LIMIT`: container limits
- `BOSSRAID_EVAL_MAX_CONCURRENT_JOBS`, `BOSSRAID_EVAL_MAX_FILES`, `BOSSRAID_EVAL_MAX_TOTAL_BYTES`, `BOSSRAID_EVAL_MAX_FILE_BYTES`, and `BOSSRAID_EVAL_MAX_PATH_LENGTH`: evaluator concurrency and input caps
- `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION`: opt-in host-side execution bypass
- `BOSSRAID_EVAL_E2E_SOCKET`, `BOSSRAID_EVAL_E2E_URL`, and `BOSSRAID_EVAL_E2E_TOKEN`: overrides for `pnpm test:evaluator:e2e`
- `BOSSRAID_DOCKER_SOCKET_SOURCE` and `BOSSRAID_DOCKER_SOCKET_GID`: helper overrides for `pnpm docker:up`

### Provider Workers

- `BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH`: local-only auth bypass
- `BOSSRAID_PROVIDER_AUTH_TYPE`, `BOSSRAID_PROVIDER_TOKEN`, and `BOSSRAID_PROVIDER_SECRET`: provider ingress auth
- `BOSSRAID_CALLBACK_AUTH_TYPE`, `BOSSRAID_CALLBACK_BASE`, `BOSSRAID_CALLBACK_TOKEN`, and `BOSSRAID_CALLBACK_SECRET`: callback auth back into the API
- `BOSSRAID_PROVIDER_ID`, `BOSSRAID_PROVIDER_NAME`, `BOSSRAID_PROVIDER_MODE`, and `BOSSRAID_PROVIDER_INSTRUCTIONS`: provider identity and specialization
- `BOSSRAID_MODEL_API_KEY`, `BOSSRAID_MODEL`, `BOSSRAID_MODEL_API_BASE`, `BOSSRAID_MODEL_REASONING_EFFORT`, `BOSSRAID_MODEL_TIMEOUT_MS`, and `BOSSRAID_MAX_OUTPUT_TOKENS`: model runtime config
- `BOSSRAID_ACCEPT_DELAY_MS` and `BOSSRAID_HEARTBEAT_INTERVAL_MS`: provider callback pacing
- `BOSSRAID_VENICE_API_BASE`, `BOSSRAID_VENICE_MODEL`, `VENICE_API_BASE`, `VENICE_MODEL`, `VENICE_REASONING_EFFORT`, and `VENICE_API_KEY_{GAMMA,DOTTIE,RIKO}`: local `pnpm dev:providers` helpers for the default Venice-backed trio

### Web, Gateway, And MCP

- `BOSSRAID_API_BASE`: MCP server upstream API base
- `BOSSRAID_API_ORIGIN`: gateway and Cloudflare Pages proxy target
- `BOSSRAID_DEMO_PROXY_TOKEN`: web, Pages, and gateway proxy header for `POST /v1/demo/raid`
- `BOSSRAID_WEB_BASE` and `BOSSRAID_OPS_BASE`: explicit demo rehearsal targets
- `BOSSRAID_GATEWAY_PORT`, `BOSSRAID_WEB_DIST_DIR`, and `BOSSRAID_OPS_DIST_DIR`: `pnpm serve:gateway` config
- `VITE_BOSSRAID_API_BASE`: local dev proxy target for the web and ops Vite servers
- `VITE_BOSSRAID_WEB_API_BASE` and `VITE_BOSSRAID_OPS_API_BASE`: browser-facing same-origin API prefixes
- `VITE_BOSSRAID_OPS_BASE_PATH`: ops SPA base path; defaults to `/ops/`
- `VITE_BOSSRAID_PROOF_RECEIPT_URL`: pinned public receipt used by `/receipt`
- `BOSSRAID_CLOUDFLARE_PAGES_PROJECT` and `BOSSRAID_CLOUDFLARE_PAGES_BRANCH`: Cloudflare Pages deploy target

### x402

- `BOSSRAID_X402_ENABLED`: paid route gate; defaults to `true` unless explicitly disabled
- `BOSSRAID_X402_PAY_TO`: recipient wallet (e.g. `0x3bd7717267c6A2D29F07Da83D59155Ac6cD80A69` for Base mainnet USDC)
- `BOSSRAID_X402_FACILITATOR_URL`: optional facilitator override
- `BOSSRAID_X402_NETWORK`, `BOSSRAID_X402_ASSET`, `BOSSRAID_X402_ASSET_NAME`, and `BOSSRAID_X402_ASSET_VERSION`: payment asset config
- `BOSSRAID_X402_RAID_PRICE_USD` and `BOSSRAID_X402_CHAT_PRICE_USD`: route surcharge added on top of requested provider budget
- `BOSSRAID_X402_MAX_AMOUNT_REQUIRED`: override for unpaid budgetless raid requests
- `BOSSRAID_X402_MAX_TIMEOUT_SECONDS`: max payment wait time
- `BOSSRAID_X402_RESOURCE_BASE_URL`: absolute resource URL base encoded into x402 headers
- `BOSSRAID_X402_VERIFY_HMAC_SECRET`: local or custom verifier shortcut
- `PAYAI_API_KEY_ID`, `PAYAI_API_KEY_SECRET`, `CDP_API_KEY_ID`, and `CDP_API_KEY_SECRET`: facilitator credentials
- `BOSSRAID_X402_E2E_MODE`, `BOSSRAID_X402_E2E_ROUTE`, `BOSSRAID_X402_E2E_API_BASE`, `BOSSRAID_X402_BUYER_PRIVATE_KEY`, and `EVM_PRIVATE_KEY`: test client helpers

### Settlement, Contracts, And Proof

- `BOSSRAID_SETTLEMENT_MODE`: `off`, `file`, or `onchain`
- `BOSSRAID_SETTLEMENT_DIR`: settlement artifact output directory; defaults to an OS temp path when unset
- `BOSSRAID_RPC_URL` and `BOSSRAID_CHAIN_ID`: chain read and write config
- `BOSSRAID_REGISTRY_ADDRESS`, `BOSSRAID_ESCROW_ADDRESS`, and `BOSSRAID_TOKEN_ADDRESS`: onchain contract addresses
- `BOSSRAID_CLIENT_PRIVATE_KEY`: client signer for child-job create, fund, and finalize flows
- `BOSSRAID_CLIENT_ADDRESS`: optional surfaced client address when the signer is managed elsewhere
- `BOSSRAID_EVALUATOR_ADDRESS`: evaluator address recorded onchain
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`: provider-id to onchain address map
- `BOSSRAID_SETTLEMENT_JOB_EXPIRY_SEC`, `BOSSRAID_SETTLEMENT_ATOMIC_MULTIPLIER`, and `BOSSRAID_SETTLEMENT_FUND_JOBS`: child-job economics and funding
- `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY` and `BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON`: optional auto-advance signers
- `BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS`: hold parent finalize until every child job is terminal
- `BOSSRAID_DEPLOYER_PRIVATE_KEY`, `BOSSRAID_PROVIDER_ADDRESSES_FILE`, `BOSSRAID_CONTRACTS_OUT`, and `BOSSRAID_SETTLEMENT_ENV_OUT`: contract deploy and settlement bootstrap helpers

### ERC-8004 And Attestation

- `BOSSRAID_ERC8004_VERIFY`: live onchain identity verification toggle
- `BOSSRAID_ERC8004_AGENT_ID`, `BOSSRAID_ERC8004_OPERATOR_WALLET`, and `BOSSRAID_ERC8004_REGISTRATION_TX`: Mercenary identity anchors
- `BOSSRAID_ERC8004_IDENTITY_REGISTRY`, `BOSSRAID_ERC8004_REPUTATION_REGISTRY`, `BOSSRAID_ERC8004_VALIDATION_REGISTRY`, and `BOSSRAID_ERC8004_VALIDATION_TXS`: registry and validation refs
- `BOSSRAID_ERC8004_LAST_VERIFIED_AT`: cached verification timestamp surfaced in proof
- `MNEMONIC`: enables attested runtime and attested result signing; without it, provider TEE badges can still be surfaced from provider proofs, but host-level runtime and result envelopes stay unpublished
- `BOSSRAID_TEE_PLATFORM` and `BOSSRAID_TEE_SOCKET_PATH`: TEE metadata and socket path for Phala CVM attestation; defaults to `phala` and `/var/run/tappd.sock`

### Privacy Engine

The privacy engine (`packages/privacy-engine`) enforces privacy compliance for strict-private raids. It integrates into the orchestrator at two points:

1. **Submission evaluation** — each provider submission is scanned for privacy violations before it is ranked
2. **Settlement gating** — raids that fail privacy compliance are blocked from paying out; the settlement record includes `privacyCompliance` proof

Privacy engine features:
- Real-time Phala CVM TEE attestation verification via `BOSSRAID_TEE_SOCKET_PATH`
- Redacted content reexposure scanning (checks submission text for sanitization markers)
- External transmission detection (flags references to external APIs in submission text)
- Per-provider privacy compliance records in settlement execution proof
- Attestation-gated settlement: providers without valid privacy attestations are excluded from payout

The privacy engine is always active when `raidPolicy.privacyMode` is `"strict"` or `"prefer"` with `requiredPrivacyFeatures` set.

### ERC-8004 and ERC-8183 via ACP

ERC-8004 identity registration and ERC-8183 onchain settlement are handled through the Virtuals ACP integration, not self-deployed contracts. The flow:

1. Register Mercenary and all provider agents through the ACP registration process at `https://acpx.virtuals.io`
2. Use `examples/virtuals-acp-capture-sheet.md` to map ACP output into Boss Raid environment variables
3. Feed resulting `erc8004` identity refs into provider registration payloads via `POST /agents/register`
4. Feed settlement addresses into `deploy/phala/docker-compose.yml` via `BOSSRAID_*` env vars

## Beta Launch Checklist

Run these in order:

### Step 1: ACP Registration (do once)
1. Go to `https://acpx.virtuals.io`
2. Register Mercenary (orchestrator)
3. Register Gamma, Riko, Dottie (providers)
4. Fill out `examples/virtuals-acp-capture-sheet.md` for each
5. Map results to `deploy/phala/production.env.example`

### Step 2: Settlement Keys and Contracts
```bash
# Generate wallets (outputs to temp/settlement-keys.json and temp/settlement-keys.env)
pnpm generate:settlement-keys

# Deploy contracts (requires BOSSRAID_RPC_URL, BOSSRAID_DEPLOYER_PRIVATE_KEY, BOSSRAID_TOKEN_ADDRESS)
pnpm deploy:contracts

# Full bootstrap: keys + deploy + settlement env in one shot
pnpm bootstrap:settlement
```

### Step 3: Fund Wallets
- **Client wallet** (`temp/settlement-keys.json`): fund with USDC on Base for escrow — each raid budgets `raid_policy.max_total_cost` per provider
- **Provider wallets**: fund with ~0.01 ETH each for gas (Gamma, Riko, Dottie addresses from key generation output)
- **Evaluator wallet**: optionally fund with ETH for gas

### Step 4: Environment Merge
```bash
source temp/settlement-keys.env && source temp/settlement-bootstrap.env
# Or merge into one file:
cat temp/settlement-keys.env temp/settlement-bootstrap.env > temp/bossraid-prod.env
```

### Step 5: Compose Deployment
```bash
# Use production.env.example as a reference
cp deploy/phala/production.env.example deploy/phala/.env
# Edit .env with real values, then:
docker compose -f deploy/phala/docker-compose.yml --env-file deploy/phala/.env up --build
```

### Step 6: Verify
```bash
# Health check
curl https://<your-api>/health | jq

# Settlement status (admin auth required)
curl -H "Authorization: Bearer $BOSSRAID_ADMIN_TOKEN" \
  https://<your-api>/v1/ops/settlement/status | jq

# Test a raid
curl -X POST https://<your-api>/v1/raid \
  -H "content-type: application/json" \
  -d @examples/strict-private-raid.json | jq
```

## Current Defaults

- Local persistence defaults to SQLite.
- API control state, launch reservations, and raid state use the configured storage backend instead of process-local memory.
- New raid launches fail closed when persistence is unavailable, and nonterminal raids resume from persisted state after restart.
- The shipped local provider trio is `gamma`, `dottie`, and `riko`.
- The public write path is `POST /v1/raid`.
- `POST /v1/raids` remains as an alias. The OpenAI-compatible path is a compatibility layer over the same raid engine.
- x402 is enabled by default on `POST /v1/raid`, `POST /v1/raids`, and `POST /v1/chat/completions` unless `BOSSRAID_X402_ENABLED=false`.
- The hosted `/demo` UI can use `POST /v1/demo/raid` as a free launch lane when `BOSSRAID_DEMO_ROUTE_ENABLED=true`.
- `BOSSRAID_SETTLEMENT_MODE=file` is the safe default proof lane. Use `onchain` plus real signer config to reach terminal ERC-8183 child-job states. Set `BOSSRAID_SETTLEMENT_MODE=onchain` only after all settlement env vars are configured and wallets are funded.
- When `settlementExecution.mode` is `onchain`, public result, receipt, attested-result, MCP receipt, and agent-log reads attempt a live contract refresh if the settlement proof carries `contracts.rpcUrl` or the runtime has `BOSSRAID_RPC_URL`.
- When that refresh changes the proof, Boss Raid persists the updated settlement record and rewrites the referenced settlement artifact JSON.
- `pnpm export:proof-bundle -- --raid-id <raidId>` attempts the same onchain refresh before it copies `result.json`, `agent_log.json`, and `settlement-execution.json`.
- `BOSSRAID_ERC8004_VERIFY` is off by default. When enabled, routing and proof reads can downgrade identities that fail onchain verification.
- `pnpm serve:gateway` and `pnpm deploy:web:cloudflare` keep browser API traffic same-origin through `/api/*`. The ops shell uses `/ops-api/*`.
- `pnpm deploy:web:cloudflare` rewrites bare IPv4 `BOSSRAID_API_ORIGIN` values to `nip.io` hostnames because Cloudflare Pages Functions will not proxy direct IP origins.
- Runtime execution is opt-in.
- The current public Pages proxy and hosted API path are expected to point at the Phala-backed control plane. Keep the EigenCompute wrapper for sponsor or judging lanes only when you explicitly need that enclave.
