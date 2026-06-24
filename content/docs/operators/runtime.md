# Runtime & Commands

Verification, deploy, and operator workflows. Env tables: [reference/env.md](../reference/env.md). Local install and default URLs: [Local development](/dev-docs/operators/local-development) in dev-docs.

## Operator path

1. **Local or Phala** — `pnpm dev` for local stack; Phala bootstrap via [Infisical](/dev-docs/operators/infisical).
2. **Readiness** — `GET /v1/ops/production-readiness` must return `ok: true` for full production.
3. **Ops UI** — authenticate with `BOSSRAID_ADMIN_TOKEN`, monitor raids, toggle x402.
4. **Ship** — gateway (`pnpm bossraid serve:gateway`) or Cloudflare Pages deploy.

Contributor scripts (`check`, `build`, `dev`, `test:*`) live in root `package.json`. Operator, deploy, and integration commands use `pnpm bossraid <command>` — run `pnpm bossraid help` for the full list.

Refresh inference catalog + reference pricing JSON:

```bash
pnpm bossraid sync:inference-catalog
```

Writes `packages/constants/src/inference-catalog.ts` and `packages/constants/data/inference-model-pricing.json` (Venice rates from public `/models`; Redpill, NEAR, Chutes, Phala from static script rates).

Regenerate brand assets (Venice; requires `VENICE_API_KEY` in `.private/.env`):

```bash
pnpm bossraid sync:oc-references
pnpm bossraid generate:pfp          # Mercenary bust portrait → assets/boss-raid-pfp.png
pnpm bossraid generate:landing-hero   # seller / raider / buyer manga panels → apps/web/src/assets/
```

Gateway (built web + ops on one origin):

```bash
pnpm bossraid serve:gateway
```

Serves `/`, `/ops/`, proxies `/api/*` and `/ops-api/*`, exposes `/healthz`.

## Ops UI

Raid ops (`pnpm dev:ops`, port `4174`) is the admin control plane. Authenticate with `BOSSRAID_ADMIN_TOKEN` via `POST /v1/ops/session`.

Sections:

| Section   | Purpose                                                                |
| --------- | ---------------------------------------------------------------------- |
| Live raid | Queue, mesh, proof, abort/re-score (confirmed), buyer deep links       |
| Launch    | Internal admin spawn with confirm; links to Mercenary for buyer wallet |
| Platform  | x402 enable/disable (confirmed), readiness, settlement, metrics        |
| Providers | Registry search and health                                             |

Dangerous actions require confirmation:

- **Enable x402** — two-step confirm; blocked when production-readiness has blocking failures
- **Disable x402** — type `DISABLE` to confirm
- **Abort raid** — confirm with raid id and status
- **Launch (ops)** — confirm budget/agents; uses `POST /v1/raid` via admin session (payment bypass when x402 is on)

Consumer tandem: ops links to web routes (`/verification`, `/mercenary`, `/playground?mode=raid`, `/marketplace`) and compares `GET /ready` `payment.enabled` with ops x402 state. Buyer receipt links need `raidAccessToken` from spawn (stored in session for the ops session).

Mercenary and inference launches from the public web require a wallet session cookie on `POST /v1/raid`, `POST /v1/chat/completions`, and `POST /v1/inference/chat/completions` unless the caller uses a buyer API key or mana billing headers. Admin bearer and ops session still bypass payment for internal launches.

Point local web at a hosted API:

```bash
BOSSRAID_API_ORIGIN=https://bossraid-web.pages.dev/api pnpm --filter @bossraid/web dev
```

## Core commands

```bash
pnpm check
pnpm build
pnpm dev
pnpm bossraid serve:gateway
pnpm test:unit
pnpm test:money-path
pnpm --filter @bossraid/api test src/marketplace-inference.test.ts
pnpm --filter @bossraid/api test:all
pnpm --filter @bossraid/web test src/lib/*.test.ts
pnpm bossraid mercenary:rehearse
pnpm bossraid export:proof-bundle -- --raid-id <raidId>
pnpm bossraid verify:attestation
pnpm bossraid deploy:web:cloudflare
```

Cloudflare Pages deploy (requires Wrangler auth):

```bash
BOSSRAID_CLOUDFLARE_PAGES_PROJECT=bossraid-web \
BOSSRAID_API_ORIGIN=https://<your-phala-or-public-api-host>/api \
pnpm bossraid deploy:web:cloudflare
```

Set the Cloudflare Pages secret `BOSSRAID_API_ORIGIN` to your public API host (Phala CVM), not a self-referential `pages.dev/api` loop. The API host must have `BOSSRAID_X402_ENABLED=true` before wallet top-ups work.

## Host attestation

`pnpm bossraid verify:attestation` checks MNEMONIC-signed envelopes from JSON (`attested-runtime` or `attested-result` payloads). It does not validate Phala TDX quotes.

Phala operators can probe the public host route:

```bash
curl -sS "${BOSSRAID_API_ORIGIN:-http://127.0.0.1:8787}/v1/host/attestation" | jq '{verified, teeVerified, runtimeSigned, teePlatform}'
```

Set `BOSSRAID_TEE_SOCKET_PATH=/var/run/dstack.sock` and `BOSSRAID_TEE_PLATFORM=phala` on CVM deploys. Use `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY=1` only when Phala Cloud verify is unavailable.

Full command list (settlement, docker, Phala, contracts):

```bash
pnpm test:smoke:e2e
pnpm bossraid test:strict-private:e2e
pnpm bossraid test:mcp:e2e
pnpm bossraid test:x402:e2e
pnpm test:bounty-escrow:local
pnpm bossraid test:bounty-escrow:e2e
pnpm bossraid test:bounty-escrow:production
pnpm bossraid settle:raid -- --raid-id <raidId>
pnpm bossraid generate:settlement-keys
pnpm bossraid bootstrap:settlement
pnpm bossraid docker:up
pnpm bossraid bootstrap:phala:env
pnpm bossraid production:cutover
pnpm bossraid infisical:phala:pull
pnpm bossraid infisical:phala:push
pnpm bossraid infisical:phala:prune-legacy
```

`production:cutover` normalizes provider settlement IDs (`dottie` / `riko` / `gamma`), deploys Base contracts when `BOSSRAID_DEPLOYER_PRIVATE_KEY` is funded, merges addresses into `deploy/phala/secrets.onchain.env`, and reassembles `deploy/phala/.env`. Use `--skip-deploy` when contract addresses are already in `temp/contracts/deployment.json`.

Active hosted stack: Phala CVM. EigenCompute stays in-repo for optional judging/attestation lanes.

## Deploy checklist

### 1. ACP registration (once)

1. Register Mercenary + providers at `https://acpx.virtuals.io`
2. Fill `examples/onboarding/virtuals-acp-capture-sheet.md`
3. Map ERC-8004 fields into `deploy/phala/secrets.onchain.env` (see `secrets.onchain.env.example`)

### 2. Settlement keys

```bash
pnpm bossraid generate:settlement-keys
pnpm bossraid deploy:contracts   # needs BOSSRAID_RPC_URL, BOSSRAID_DEPLOYER_PRIVATE_KEY
pnpm bossraid bootstrap:settlement
```

Fund client wallet (USDC for escrow), provider wallets (~0.01 ETH gas each).

### 2b. Bounty escrow (onchain)

`pnpm bossraid bootstrap:settlement` writes `BOSSRAID_BOUNTY_ESCROW_ADDRESS` alongside raid escrow addresses. Production onchain mode requires it; `GET /v1/ops/production-readiness` reports `bounty_escrow_configured`.

Operator wallet (`BOSSRAID_CLIENT_PRIVATE_KEY`) must hold:

- USDC on Base for raid escrow, bounty escrow funding, and gas
- An ERC-20 allowance to `BossBountyEscrow` (the API calls `approve` before each fund when allowance is low)

Buyer flow:

1. Poster signs in with wallet session (`POST /v1/bounties`)
2. `POST /v1/bounties/:id/fund` returns x402 `402` with `payment-required`
3. Poster pays USDC via x402; settlement payer must match the poster wallet
4. API relayer calls `createBountyOnBehalf` + `fundBountyOnBehalf` on `BossBountyEscrow`

`BOSSRAID_X402_PAY_TO` is the platform receive wallet for raid/inference charges. Bounty poster USDC is settled through x402, then moved into onchain escrow by the client signer — not left in `payTo`.

Dev-only bypass: `BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND=true` (forbidden in production audit). Smoke tests:

```bash
pnpm test:bounty-escrow:local                        # zero-config; auto onchain when temp/settlement-bootstrap.env exists
pnpm bossraid test:bounty-escrow:e2e                 # against running API; defaults to bounty-e2e-provider
pnpm bossraid test:bounty-escrow:production          # wallet mode; caps reward via BOSSRAID_BOUNTY_E2E_REWARD_USD
```

`test:bounty-escrow:local` spins an ephemeral API, uses `bounty-e2e-provider` from [`examples/settlement/bounty-e2e.providers.json`](../../examples/settlement/bounty-e2e.providers.json), and skips x402 unless bootstrap settlement env is present. Optional overrides: [`examples/settlement/bounty-e2e.env.example`](../../examples/settlement/bounty-e2e.env.example). Provider/agent curl flow: [sellers/bounties.md](../sellers/bounties.md).

### 3. Phala deploy

```bash
cp deploy/phala/secrets.core.env.example deploy/phala/secrets.core.env
# optional: deploy/phala/secrets.onchain.env after pnpm bossraid bootstrap:settlement
pnpm bossraid bootstrap:phala:env
pnpm bossraid phala:secrets:check deploy/phala/.env
pnpm bossraid infisical:phala:push
```

```bash
phala deploy --cvm-id bossraid-main \
  --compose deploy/phala/docker-compose.yml \
  -e deploy/phala/.env \
  --wait
```

Secret rotation: `phala envs update bossraid-main -e deploy/phala/.env`. Infisical workflow: [Infisical secrets](/dev-docs/operators/infisical) in dev-docs.

### 4. Verify

```bash
curl https://<api>/health | jq
curl https://<api>/ready | jq
curl -H "Authorization: Bearer $BOSSRAID_ADMIN_TOKEN" \
  https://<api>/v1/ops/production-readiness | jq
```

Production gate: `ok: true` on `GET /v1/ops/production-readiness` before unrestricted paid traffic. `GET /ready` also enforces production-only checks when `NODE_ENV=production` (onchain settlement configured, upstream mocks disabled, unverified balance fund disabled). Static deploy audit (matches CI):

```bash
NODE_ENV=production \
BOSSRAID_SETTLEMENT_MODE=onchain \
BOSSRAID_X402_ENABLED=true \
BOSSRAID_SETTLEMENT_FUND_JOBS=true \
BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS=true \
BOSSRAID_BOUNTY_ESCROW_ADDRESS=0x0000000000000000000000000000000000000201 \
BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET=ci-audit-secret \
BOSSRAID_SECRET_ENCRYPTION_KEY=ci-audit-encryption-key \
node scripts/audit-production-deploy-env.mjs
```

Trust boundary: [trust-and-safety.md](trust-and-safety.md).

Ops UI (`/ops/`) surfaces the same admin routes after login:

- **Production readiness** — blocking launch checks from `GET /v1/ops/production-readiness`
- **Settlement status** — onchain contract/RPC health from `GET /v1/ops/settlement/status`
- **Ops metrics** — JSON counters and route latency from `GET /v1/ops/metrics`
- **x402 toggle** — facilitator, pay-to wallet, network, and enable blockers from `GET /v1/ops/settings`
- **Launch presets** — default raid payload plus strict-private `privacyMode: "strict"` variant

## Defaults

- Persistence: SQLite locally; raids fail closed when storage is unavailable.
- Native write route: `POST /v1/raid` (`raid_request` body).
- x402 off until ops toggle or `BOSSRAID_X402_ENABLED=true` on boot.
- MetaMask cookoff lane: set `BOSSRAID_X402_FACILITATOR_PRESET=metamask_base_mainnet`, `BOSSRAID_X402_ASSET_TRANSFER_METHOD=erc7710`, and a funded wallet on `/mercenary` (paid mode) or via MCP `bossraid_grant_session` + `POST /v1/raid`.
- ERC-7710 delegation manager: use `BOSSRAID_DELEGATION_MANAGER_ADDRESS` when MetaMask does not return `signerMeta.delegationManager` from ERC-7715 grants.
- 1Shot relayer: configure `BOSSRAID_ONESHOT_RELAYER_URL`; API exposes `/v1/relayer/*` (capabilities, fee-data, estimate, send, status, webhook) for agent relay proofs.
- Prometheus: `/metrics` is admin-only unless `BOSSRAID_METRICS_PUBLIC=true`.
- Mana billing: reservations use `BOSSRAID_MANA_CORE_APP_ID` (default `bossraid`) when Mana Core headers are present on paid routes.
- Settlement: `file` by default; `onchain` only with funded signers and contract env.
- Successful providers split payout equally.
- Browser API traffic stays same-origin via `/api/*` (gateway or Cloudflare Pages proxy).
