# Scripts

Repo automation lives here. Contributor commands stay in root [`package.json`](../package.json); operator workflows use [`pnpm bossraid`](../package.json) (`pnpm bossraid help`).

## Contributor / CI (package.json)

Workspace check, build, and unit test scripts limit Turbo to two package jobs at a time. Run CPU intensive local checks serially.

| Script                             | Purpose                                  |
| ---------------------------------- | ---------------------------------------- |
| `dev-stack.mjs`                    | `pnpm dev` — API, web, ops, evaluator    |
| `dev-api.mjs`                      | `pnpm dev:api`                           |
| `dev-providers.mjs`                | `pnpm dev:providers`                     |
| `dev-kill.mjs`                     | `pnpm dev:kill`                          |
| `test-raid-e2e.mjs`                | `pnpm test:smoke:e2e` (`--profile game`) |
| `test-bounty-escrow-local-e2e.mjs` | `pnpm test:bounty-escrow:local`          |
| `bossraid.mjs`                     | `pnpm bossraid <command>`                |

## Operator (bossraid CLI)

Deploy, sync, extended e2e, Phala/Infisical, settlement, and asset pipelines are registered in [`bossraid.mjs`](bossraid.mjs). Examples:

```bash
pnpm bossraid sync:inference-catalog
pnpm bossraid deploy:web:cloudflare
pnpm bossraid test:strict-private:e2e
```

### Inference catalog

`sync:inference-catalog` imports public models.dev metadata/provider rates and provider catalogs. `--cached` regenerates from committed snapshots without network. `--check` reports additions, removals, changes, stale sources, and fetch failures without writing; combine both flags for CI. Pass options after `--`, for example `pnpm bossraid sync:inference-catalog -- --cached --check`.

Builds use the committed catalog and do not fetch public data. Import code lives in `lib/inference-catalog/`; local policy lives in `packages/constants/data/inference-overrides.json`. Generated source snapshots and exclusion reports live alongside it. See [runtime](../content/docs/operators/runtime.md#catalog-refresh).

## Examples-only

Party Quest / Forgejo campaign tooling for [`examples/campaigns/bossraid-development/`](../examples/campaigns/bossraid-development/):

- `examples/campaigns/bossraid-development/scripts/setup-forgejo-ops.mjs`
- `examples/campaigns/bossraid-development/scripts/setup-forgejo-agent-users.mjs`
- `examples/campaigns/bossraid-development/scripts/dogfood-party-quest-bossraid.mjs`
- `examples/campaigns/bossraid-development/scripts/smoke-party-quest-bossraid.mjs`
- `examples/campaigns/bossraid-development/scripts/test-party-quest-bossraid-smoke.mjs`

Also exposed as `pnpm bossraid test:partyquest-bossraid:smoke`.

Host bootstrap shell runbooks (Linux + Party Quest) are gitignored under [`deploy/ops-local/`](../deploy/ops-local/) — see [`deploy/ops-local.example/README.md`](../deploy/ops-local.example/README.md).

## Shared modules (`lib/`)

Not invoked directly. Imported by dev, e2e, deploy, and bounty scripts:

- `dev-ports.mjs`, `dev-process.mjs`, `dev-providers-file.mjs`, `provider-launcher.mjs` — local dev stack
- `e2e-harness.mjs`, `http-e2e.mjs`, `process-harness.mjs` — integration tests
- `bounty-e2e-env.mjs`, `bounty-e2e-run.mjs`, `x402-e2e-payment.mjs` — money-path smokes
- `phala-secret-tiers.mjs` — Phala deploy env assembly

## Docs app

Papers build scripts live under [`apps/docs/scripts/`](../apps/docs/scripts/) — separate from this tree.
