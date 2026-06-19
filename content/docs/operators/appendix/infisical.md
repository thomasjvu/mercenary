# Infisical Secret Workflow

Boss Raid uses Infisical as the backup/source-of-truth for production Phala
environment secrets, while keeping the local deploy file untracked at
`deploy/phala/.env`.

Default mapping:

- Infisical domain: `https://infisical.phantasy.bot`
- Organization ID: `6cbdc8e5-c7d6-4677-809f-1e367ea06d16`
- Project ID: `5d94a3f6-78e6-433e-b4f4-c0099a5f49de`
- Infisical environment: `prod`
- Infisical path: `/bossraid/phala`
- Local file: `deploy/phala/.env`

Repo binding lives in `.infisical.json`.

## One-Time Setup

Initialize the repo against the Boss Raid Infisical project:

```bash
cloudflared access login https://infisical.phantasy.bot
infisical login --domain https://infisical.phantasy.bot/api
infisical init
```

For machine identity or CI, set:

```bash
export INFISICAL_API_URL=https://infisical.phantasy.bot
export INFISICAL_PROJECT_ID=5d94a3f6-78e6-433e-b4f4-c0099a5f49de
export INFISICAL_MACHINE_CLIENT_ID=<bossraid-phala-ci-client-id>
export INFISICAL_MACHINE_CLIENT_SECRET=<bossraid-phala-ci-client-secret>
export CF_ACCESS_CLIENT_ID=<cloudflare-access-client-id>
export CF_ACCESS_CLIENT_SECRET=<cloudflare-access-client-secret>
```

Do not set `INFISICAL_ORGANIZATION_ID` when using machine identity auth.
Use it only for interactive user login across multiple organizations.

Do not commit Infisical auth tokens, service tokens, or `deploy/phala/.env`.

## Push Local Secrets To Infisical

Create and fill the local env file first:

```bash
cp deploy/phala/production.env.example deploy/phala/.env
pnpm phala:secrets:check deploy/phala/.env
```

Then back it up to Infisical:

```bash
pnpm infisical:phala:push
```

The push script runs the Phala secret preflight before writing to Infisical.

## Pull Infisical Secrets Locally

To recreate the untracked deploy env from Infisical:

```bash
pnpm infisical:phala:pull
```

This exports the Infisical `prod:/bossraid/phala` secrets into
`deploy/phala/.env`, then runs `pnpm phala:secrets:check`.

Use overrides when needed:

```bash
INFISICAL_ENV=staging INFISICAL_PATH=/bossraid/phala/staging pnpm infisical:phala:pull
pnpm infisical:phala:push -- --env prod --path /bossraid/phala --file deploy/phala/.env
```

## Deploy To Phala

After pulling and checking:

```bash
phala envs update bossraid-main -e deploy/phala/.env
```

or for a full compose update:

```bash
phala deploy --cvm-id bossraid-main \
  --compose deploy/phala/docker-compose.yml \
  -e deploy/phala/.env \
  --wait
```
