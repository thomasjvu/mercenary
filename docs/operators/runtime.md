# Runtime & Commands

Local dev, verification, deploy. Env tables: [reference/env.md](../reference/env.md).

## Local development

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm build
pnpm dev
```

`pnpm dev` starts evaluator, API, web, ops, and local providers.

| Service   | Default URL                                                               |
| --------- | ------------------------------------------------------------------------- |
| web       | `http://127.0.0.1:4173`                                                   |
| ops       | `http://127.0.0.1:4174` (production readiness, settlement, metrics, x402) |
| API       | `http://127.0.0.1:8787`                                                   |
| evaluator | `http://127.0.0.1:8790` or `/tmp/bossraid-evaluator.sock`                 |
| providers | `9001`, `9002`, `9003`                                                    |

Manual start: `pnpm dev:providers`, `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:ops`, `pnpm dev:evaluator`, `pnpm dev:mcp`.

Refresh inference catalog + reference pricing JSON:

```bash
pnpm sync:inference-catalog
```

Writes `packages/constants/src/inference-catalog.ts` and `packages/constants/data/inference-model-pricing.json` (Venice rates from public `/models`; Redpill, NEAR, Chutes, Phala from static script rates).

Gateway (built web + ops on one origin):

```bash
pnpm serve:gateway
```

Serves `/`, `/ops/`, proxies `/api/*` and `/ops-api/*`, exposes `/healthz`.

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
pnpm demo:rehearse
pnpm export:proof-bundle -- --raid-id <raidId>
pnpm verify:attestation
pnpm deploy:web:cloudflare
```

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

Production gate: `ok: true` before unrestricted paid traffic. Trust boundary: [trust-and-safety.md](trust-and-safety.md).

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
- MetaMask cookoff lane: set `BOSSRAID_X402_FACILITATOR_PRESET=metamask_base_mainnet`, `BOSSRAID_X402_ASSET_TRANSFER_METHOD=erc7710`, and a funded wallet on `/demo` (paid mode) or via MCP `bossraid_grant_session` + `POST /v1/raid`.
- ERC-7710 delegation manager: use `BOSSRAID_DELEGATION_MANAGER_ADDRESS` when MetaMask does not return `signerMeta.delegationManager` from ERC-7715 grants.
- 1Shot relayer: configure `BOSSRAID_ONESHOT_RELAYER_URL`; API exposes `/v1/relayer/*` and webhook status for agent relay proofs.
- Settlement: `file` by default; `onchain` only with funded signers and contract env.
- Successful providers split payout equally.
- Browser API traffic stays same-origin via `/api/*` (gateway or Cloudflare Pages proxy).
