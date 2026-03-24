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

Manual start:

```bash
pnpm dev:providers
pnpm dev:api
pnpm dev:web
pnpm dev:ops
pnpm dev:evaluator
pnpm dev:mcp
```

When running only the web app against a hosted API, point the dev proxy at that Boss Raid API origin:

```bash
BOSSRAID_API_ORIGIN=http://35.198.249.153:8080/api pnpm --filter @bossraid/web dev
```

If Vite still proxies `/api/*` to `127.0.0.1:8787`, the repo root `.env` still has `VITE_BOSSRAID_API_BASE=http://127.0.0.1:8787`. Override it inline for that shell or update `.env`.

If the hosted API protects `POST /v1/demo/raid` with `BOSSRAID_DEMO_TOKEN`, mirror that token into the web proxy:

```bash
BOSSRAID_API_ORIGIN=http://35.198.249.153:8080/api \
BOSSRAID_DEMO_PROXY_TOKEN=demo-proxy-secret \
pnpm --filter @bossraid/web dev
```

## Key Environment Variables

- `BOSSRAID_STORAGE_BACKEND`: `sqlite` by default
- `BOSSRAID_SQLITE_FILE`: local SQLite path
- `BOSSRAID_PROVIDERS_FILE`: provider registry seed file
- `BOSSRAID_MODEL_API_KEY`: provider model key
- `BOSSRAID_MODEL_API_BASE`: optional OpenAI-compatible base URL override
- `BOSSRAID_MODEL`: provider model name
- `BOSSRAID_ADMIN_TOKEN`: admin auth for internal API routes and ops login
- `BOSSRAID_REGISTRY_TOKEN`: auth for registry writes
- `BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH`: local-only insecure provider auth shortcut
- `BOSSRAID_DEMO_ROUTE_ENABLED`: enable `POST /v1/demo/raid` as a free launch lane for the hosted `/demo` UI
- `BOSSRAID_DEMO_TOKEN`: optional API-side token required by `POST /v1/demo/raid`
- `BOSSRAID_X402_ENABLED`: enable paid public routes
- `BOSSRAID_X402_PAY_TO`: recipient wallet for paid x402 raid and chat requests
- `BOSSRAID_EVAL_RUNTIME_EXECUTION`: enable runtime probes
- `BOSSRAID_EVAL_SANDBOX_MODE`: `socket` or `http`
- `BOSSRAID_SETTLEMENT_MODE`: `off`, `file`, or `onchain`
- `BOSSRAID_SETTLEMENT_DIR`: settlement artifact output directory
- `BOSSRAID_SETTLEMENT_JOB_EXPIRY_SEC`: child-job expiry window for onchain settlement
- `BOSSRAID_SETTLEMENT_ATOMIC_MULTIPLIER`: USD-to-token atomic multiplier for onchain budgets
- `BOSSRAID_SETTLEMENT_FUND_JOBS`: escrow successful child jobs onchain
- `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY`: optional evaluator signer for auto-complete and funded-job reject flows
- `BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON`: optional provider-id to private-key map for auto-submit flows
- `BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS`: skip parent finalize when a child job is not terminal
- `BOSSRAID_REGISTRY_ADDRESS`: onchain raid registry address for `BOSSRAID_SETTLEMENT_MODE=onchain`
- `BOSSRAID_ESCROW_ADDRESS`: onchain child-job escrow address for `BOSSRAID_SETTLEMENT_MODE=onchain`
- `BOSSRAID_TOKEN_ADDRESS`: ERC-20 settlement token used by the escrow contract
- `BOSSRAID_CLIENT_PRIVATE_KEY`: client signer used for onchain child-job creation, linking, funding, and finalization
- `BOSSRAID_EVALUATOR_ADDRESS`: evaluator address recorded onchain for child jobs
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`: provider-id to provider-address map for onchain child jobs
- `BOSSRAID_ERC8004_VERIFY`: verify ERC-8004 identity proof against chain data before routing and proof reads
- `BOSSRAID_ERC8004_AGENT_ID`: Mercenary ERC-8004 token id
- `BOSSRAID_ERC8004_OPERATOR_WALLET`: Mercenary ERC-8004 owner or operator wallet
- `BOSSRAID_ERC8004_REGISTRATION_TX`: Mercenary ERC-8004 registration transaction hash
- `BOSSRAID_ERC8004_IDENTITY_REGISTRY`: ERC-8004 identity registry contract address
- `BOSSRAID_ERC8004_REPUTATION_REGISTRY`: optional ERC-8004 reputation registry contract address
- `BOSSRAID_ERC8004_VALIDATION_REGISTRY`: optional ERC-8004 validation registry contract address
- `BOSSRAID_ERC8004_VALIDATION_TXS`: optional comma-separated validation transaction hashes
- `BOSSRAID_API_ORIGIN`: gateway upstream and Cloudflare Pages `/api` proxy target
- `BOSSRAID_DEMO_PROXY_TOKEN`: optional Pages, Vite, and gateway proxy token forwarded to `POST /v1/demo/raid`
- `BOSSRAID_CLOUDFLARE_PAGES_PROJECT`: Cloudflare Pages project name for `pnpm deploy:web:cloudflare`
- `BOSSRAID_CLOUDFLARE_PAGES_BRANCH`: optional Pages branch target for preview deploys
- `VITE_BOSSRAID_PROOF_RECEIPT_URL`: optional pinned public receipt URL used by `/receipt` as a no-wallet proof lane
- `MNEMONIC`: enables attested runtime and attested result routes

## Useful Commands

```bash
pnpm --filter @bossraid/mcp-server test
pnpm test:game-raid:e2e
pnpm test:private-game-raid:e2e
pnpm test:strict-private:e2e
pnpm test:mcp:e2e
pnpm test:evaluator:e2e
pnpm test:x402:e2e
pnpm demo:rehearse
pnpm deploy:web:cloudflare
pnpm render:video
pnpm docker:build
pnpm docker:up
pnpm eigencompute:build
```

## Current Defaults

- Local persistence defaults to SQLite.
- The shipped local provider trio is `gamma`, `dottie`, and `riko`.
- The public write path is `POST /v1/raid`.
- The hosted `/demo` UI can use `POST /v1/demo/raid` as a free launch lane when `BOSSRAID_DEMO_ROUTE_ENABLED=true`.
- The OpenAI-compatible path is a compatibility layer over the same raid engine.
- `BOSSRAID_SETTLEMENT_MODE=file` is the safe default proof lane. Use `onchain` plus real signer config to reach terminal ERC-8183 child-job states.
- When `settlementExecution.mode` is `onchain`, public result, receipt, attested-result, MCP receipt, and agent-log reads attempt a live contract refresh if the settlement proof carries `contracts.rpcUrl` or the runtime has `BOSSRAID_RPC_URL`.
- When that refresh changes the proof, Boss Raid persists the updated settlement record and rewrites the referenced settlement artifact JSON.
- `pnpm export:proof-bundle -- --raid-id <raidId>` also attempts the same onchain refresh before it copies `result.json`, `agent_log.json`, and `settlement-execution.json`.
- `BOSSRAID_ERC8004_VERIFY` is off by default. When enabled, routing and proof reads can downgrade identities that fail onchain verification.
- `pnpm deploy:web:cloudflare` deploys `apps/web` to Cloudflare Pages and keeps `/api/*` same-origin through a Pages proxy function.
- `pnpm deploy:web:cloudflare` rewrites bare IPv4 `BOSSRAID_API_ORIGIN` values to `nip.io` hostnames because Cloudflare Pages Functions will not proxy direct IP origins.
- Runtime execution is opt-in.
