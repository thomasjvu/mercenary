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
- `BOSSRAID_X402_ENABLED`: enable paid public routes
- `BOSSRAID_EVAL_RUNTIME_EXECUTION`: enable runtime probes
- `BOSSRAID_EVAL_SANDBOX_MODE`: `socket` or `http`
- `BOSSRAID_API_ORIGIN`: gateway upstream and Cloudflare Pages `/api` proxy target
- `BOSSRAID_CLOUDFLARE_PAGES_PROJECT`: Cloudflare Pages project name for `pnpm deploy:web:cloudflare`
- `BOSSRAID_CLOUDFLARE_PAGES_BRANCH`: optional Pages branch target for preview deploys
- `MNEMONIC`: enables attested runtime and attested result routes

## Useful Commands

```bash
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
- The OpenAI-compatible path is a compatibility layer over the same raid engine.
- `pnpm deploy:web:cloudflare` deploys `apps/web` to Cloudflare Pages and keeps `/api/*` same-origin through a Pages proxy function.
- Runtime execution is opt-in.
