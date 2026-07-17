# Phala deploy layout

Production Phala secrets are **tiered** in Infisical and assembled locally before deploy.

## Files

| File                                | Tracked | Purpose                                             |
| ----------------------------------- | ------- | --------------------------------------------------- |
| `secrets.core.env.example`          | yes     | Template for core tier (14 secrets)                 |
| `secrets.onchain.env.example`       | yes     | Template for onchain overlay (optional)             |
| `secrets.core.env`                  | no      | Local core secrets → `prod:/bossraid/phala/core`    |
| `secrets.onchain.env`               | no      | Local onchain keys → `prod:/bossraid/phala/onchain` |
| `.env`                              | no      | Assembled compose env passed to `phala deploy -e`   |
| `docker-compose.yml`                | yes     | API + evaluator; platform seats by default          |
| `providers-only.docker-compose.yml` | yes     | Optional game-raid HTTP workers only                |
| `providers-only.env.example`        | yes     | Env for provider-only slice                         |
| `acp-sellers.docker-compose.yml`    | yes     | ACP seller sidecars (separate env)                  |
| `acp-sellers.env.example`           | yes     | ACP seller credentials                              |

**Default ready providers** are platform liquidity seats (e.g. `platform-xai-grok-4-5`), not in-CVM
demo agents. Compose seeds `examples/inference/platform-only.providers.json` (empty array), sets
`BOSSRAID_BOOTSTRAP_PLATFORM_LIQUIDITY=1`, and removes `dottie` / `riko` / `gamma` via
`BOSSRAID_DISABLED_PROVIDER_IDS`. Demo HTTP workers (`provider-a/b/c`) are under compose profile
`game-providers` only.

Other compose defaults (x402 network, rate limits) live in
[`scripts/lib/phala-secret-tiers.mjs`](../../scripts/lib/phala-secret-tiers.mjs) and are written into
`.env` by bootstrap — not stored in Infisical.

## Bootstrap workflow

```bash
cp deploy/phala/secrets.core.env.example deploy/phala/secrets.core.env
# optional after settlement bootstrap:
cp deploy/phala/secrets.onchain.env.example deploy/phala/secrets.onchain.env

pnpm bossraid bootstrap:phala:env
pnpm bossraid phala:secrets:check deploy/phala/.env
pnpm bossraid infisical:phala:push   # or pull
```

## Deploy

```bash
phala deploy --cvm-id bossraid-main \
  --compose deploy/phala/docker-compose.yml \
  -e deploy/phala/.env \
  --wait
```

Infisical details: [content/docs/operators/appendix/infisical.md](../../content/docs/operators/appendix/infisical.md).
