# Infisical Secret Workflow

Boss Raid uses Infisical as the backup/source-of-truth for production Phala
environment secrets, while keeping the local deploy file untracked at
`deploy/phala/.env`.

Default mapping:

- Infisical environment: `prod`
- Infisical path: `/bossraid/phala`
- Local file: `deploy/phala/.env`

## One-Time Setup

Initialize the repo against the correct Infisical project:

```bash
infisical login --domain <your-infisical-domain>
infisical init
```

If you use machine identity or CI, set:

```bash
export INFISICAL_TOKEN=<machine-identity-or-service-token>
export INFISICAL_PROJECT_ID=<project-id>
export INFISICAL_API_URL=<your-infisical-domain>
```

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
