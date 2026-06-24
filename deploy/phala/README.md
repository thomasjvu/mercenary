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
| `docker-compose.yml`                | yes     | Full stack (API + evaluator + 3 providers)          |
| `providers-only.docker-compose.yml` | yes     | Provider workers only                               |
| `providers-only.env.example`        | yes     | Env for provider-only slice                         |
| `acp-sellers.docker-compose.yml`    | yes     | ACP seller sidecars (separate env)                  |
| `acp-sellers.env.example`           | yes     | ACP seller credentials                              |

Compose defaults (provider ids `dottie` / `riko` / `gamma`, x402 network, rate limits) live in
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
