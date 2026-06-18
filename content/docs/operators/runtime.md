# Runtime & Commands

Verification, deploy, and operator workflows. Env tables: [reference/env.md](../reference/env.md). Local install and default URLs: [Local development](/dev-docs/operators/local-development) in dev-docs.

Refresh inference catalog + reference pricing JSON:

```bash
pnpm sync:inference-catalog
```

Writes `packages/constants/src/inference-catalog.ts` and `packages/constants/data/inference-model-pricing.json` (Venice rates from public `/models`; Redpill, NEAR, Chutes, Phala from static script rates).

Regenerate legal-page Mercenary float (Venice; requires `VENICE_API_KEY` in `.private/.env`):

```bash
pnpm sync:oc-references
pnpm generate:pfp               # Mercenary bust portrait → assets/boss-raid-pfp.png
pnpm generate:landing-hero      # seller / raider / buyer manga panels → apps/web/src/assets/
pnpm generate:legal-character   # keyframe + clip + webm export
pnpm export:legal-character   # re-export webm from existing S07 MP4 only
```

See [Legal Character Art](/dev-docs/brand/legal-character-art) in dev-docs.

Gateway (built web + ops on one origin):

```bash
pnpm serve:gateway
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
pnpm serve:gateway
pnpm test:unit
pnpm --filter @bossraid/api test src/marketplace-inference.test.ts
pnpm --filter @bossraid/api test:all
pnpm --filter @bossraid/web test src/lib/*.test.ts
pnpm mercenary:rehearse
pnpm export:proof-bundle -- --raid-id <raidId>
pnpm verify:attestation
pnpm deploy:web:cloudflare
```

Cloudflare Pages deploy (requires Wrangler auth):

```bash
BOSSRAID_CLOUDFLARE_PAGES_PROJECT=bossraid-web \
BOSSRAID_API_ORIGIN=https://<your-phala-or-public-api-host>/api \
pnpm deploy:web:cloudflare
```

Set the Cloudflare Pages secret `BOSSRAID_API_ORIGIN` to your public API host (Phala CVM), not a self-referential `pages.dev/api` loop. The API host must have `BOSSRAID_X402_ENABLED=true` before wallet top-ups work.

Full command list (settlement, docker, Phala, contracts):

```bash
pnpm test:game-raid:e2e
pnpm test:strict-private:e2e
pnpm test:mcp:e2e
pnpm test:x402:e2e
pnpm settle:raid -- --raid-id <raidId>
pnpm generate:settlement-keys
pnpm bootstrap:settlement
pnpm docker:up
pnpm infisical:phala:pull
pnpm infisical:phala:push
```

Active hosted stack: Phala CVM. EigenCompute stays in-repo for optional judging/attestation lanes.

## Deploy checklist

### 1. ACP registration (once)

1. Register Mercenary + providers at `https://acpx.virtuals.io`
2. Fill `examples/virtuals-acp-capture-sheet.md`
3. Map to `deploy/phala/production.env.example`

See [appendix/synthesis-registration.md](appendix/synthesis-registration.md).

### 2. Settlement keys

```bash
pnpm generate:settlement-keys
pnpm deploy:contracts   # needs BOSSRAID_RPC_URL, BOSSRAID_DEPLOYER_PRIVATE_KEY
pnpm bootstrap:settlement
```

Fund client wallet (USDC for escrow), provider wallets (~0.01 ETH gas each).

### 3. Phala deploy

```bash
cp deploy/phala/production.env.example deploy/phala/.env
pnpm phala:secrets:check deploy/phala/.env
pnpm infisical:phala:push
```

```bash
phala deploy --cvm-id bossraid-main \
  --compose deploy/phala/docker-compose.yml \
  -e deploy/phala/.env \
  --wait
```

Secret rotation: `phala envs update bossraid-main -e deploy/phala/.env`. Infisical workflow: [appendix/infisical.md](appendix/infisical.md).

### 4. Verify

```bash
curl https://<api>/health | jq
curl https://<api>/ready | jq
curl -H "Authorization: Bearer $BOSSRAID_ADMIN_TOKEN" \
  https://<api>/v1/ops/production-readiness | jq
```

Production gate: `ok: true` on `GET /v1/ops/production-readiness` before unrestricted paid traffic. `GET /ready` also enforces production-only checks when `NODE_ENV=production` (onchain settlement configured, upstream mocks disabled, unverified balance fund disabled). Static deploy audit: `NODE_ENV=production BOSSRAID_SETTLEMENT_MODE=onchain BOSSRAID_X402_ENABLED=true node scripts/audit-production-deploy-env.mjs`. Trust boundary: [trust-and-safety.md](trust-and-safety.md).

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
