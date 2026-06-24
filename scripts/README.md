# Scripts

Repo automation lives here. Contributor commands stay in root [`package.json`](../package.json); operator workflows use [`pnpm bossraid`](../package.json) (`pnpm bossraid help`).

## Contributor / CI (package.json)

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

## Examples-only

Party Quest / Forgejo campaign tooling for [`examples/campaigns/bossraid-development/`](../examples/campaigns/bossraid-development/):

- `examples/campaigns/bossraid-development/scripts/setup-forgejo-ops.mjs`
- `examples/campaigns/bossraid-development/scripts/setup-forgejo-agent-users.mjs`
- `examples/campaigns/bossraid-development/scripts/dogfood-party-quest-bossraid.mjs`
- `examples/campaigns/bossraid-development/scripts/smoke-party-quest-bossraid.mjs`
- `examples/campaigns/bossraid-development/scripts/test-party-quest-bossraid-smoke.mjs`

Also exposed as `pnpm bossraid test:partyquest-bossraid:smoke`.

## Shared modules (`lib/`)

Not invoked directly. Imported by dev, e2e, deploy, and bounty scripts:

- `dev-ports.mjs`, `dev-process.mjs`, `dev-providers-file.mjs`, `provider-launcher.mjs` — local dev stack
- `e2e-harness.mjs`, `http-e2e.mjs`, `process-harness.mjs` — integration tests
- `bounty-e2e-env.mjs`, `bounty-e2e-run.mjs`, `x402-e2e-payment.mjs` — money-path smokes
- `phala-secret-tiers.mjs` — Phala deploy env assembly

## Docs app

Papers build scripts live under [`apps/docs/scripts/`](../apps/docs/scripts/) — separate from this tree.
