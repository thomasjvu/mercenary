# Infisical Secret Workflow

Boss Raid stores **tiered Phala secrets** in Infisical and assembles the full
compose env locally at `deploy/phala/.env`.

Infisical is not a flat 60-key dump. It holds:

- **Core tier** — runtime secrets required for the current Phala stack
- **Onchain overlay** — settlement keys loaded only when flipping to onchain mode

Compose defaults (rate limits, provider metadata, x402 network constants) live in
[`deploy/phala/docker-compose.yml`](../../../deploy/phala/docker-compose.yml) and
[`scripts/lib/phala-secret-tiers.mjs`](../../../scripts/lib/phala-secret-tiers.mjs),
not in Infisical.

## Mapping

| Item                  | Value                                  |
| --------------------- | -------------------------------------- |
| Domain                | `https://infisical.phantasy.bot`       |
| Organization ID       | `6cbdc8e5-c7d6-4677-809f-1e367ea06d16` |
| Project ID            | `5d94a3f6-78e6-433e-b4f4-c0099a5f49de` |
| Environment           | `prod`                                 |
| Core path             | `/bossraid/phala/core`                 |
| Onchain path          | `/bossraid/phala/onchain`              |
| Local core file       | `deploy/phala/secrets.core.env`        |
| Local onchain file    | `deploy/phala/secrets.onchain.env`     |
| Assembled deploy file | `deploy/phala/.env`                    |

Repo binding: [`.infisical.json`](../../../.infisical.json)

## Secret tiers

### Core tier (14 Infisical secrets)

Stored at `prod:/bossraid/phala/core`:

| Key                                 | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `BOSSRAID_IMAGE`                    | Main app image digest/ref                         |
| `BOSSRAID_EVALUATOR_IMAGE`          | Evaluator image digest/ref                        |
| `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE` | Evaluator job image digest/ref                    |
| `BOSSRAID_ADMIN_TOKEN`              | Admin / ops auth                                  |
| `BOSSRAID_REGISTRY_TOKEN`           | Provider registry auth                            |
| `BOSSRAID_SECRET_ENCRYPTION_KEY`    | SQLite secret encryption                          |
| `BOSSRAID_EVAL_SANDBOX_TOKEN`       | API ↔ evaluator sandbox auth                      |
| `BOSSRAID_PROVIDER_A/B/C_TOKEN`     | In-CVM provider ingress tokens                    |
| `BOSSRAID_VENICE_API_KEY`           | Shared upstream inference key for all 3 providers |
| `BOSSRAID_X402_PAY_TO`              | Treasury receive wallet                           |
| `PAYAI_API_KEY_ID`                  | x402 facilitator                                  |
| `PAYAI_API_KEY_SECRET`              | x402 facilitator                                  |

### Onchain overlay (optional until launch)

Stored at `prod:/bossraid/phala/onchain` when settlement is being staged:

- `BOSSRAID_CLIENT_PRIVATE_KEY`
- `BOSSRAID_EVALUATOR_ADDRESS`
- `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY`
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`
- `BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON`
- `BOSSRAID_REGISTRY_ADDRESS`, `BOSSRAID_ESCROW_ADDRESS`, `BOSSRAID_BOUNTY_ESCROW_ADDRESS`
- `BOSSRAID_ERC8004_*` identity fields

While `BOSSRAID_SETTLEMENT_MODE=file`, these are not required at runtime. Bootstrap
only enables onchain mode when `BOSSRAID_REGISTRY_ADDRESS` is present in the overlay.

### Assembled deploy defaults (not in Infisical)

Written into `deploy/phala/.env` by bootstrap/pull:

- Provider id/name/mode/instructions for `dottie`, `riko`, `gamma`
- x402 network/asset/facilitator defaults
- Public and buyer rate limits
- Operator launch ack flags
- `BOSSRAID_PROVIDERS_FILE`, `BOSSRAID_TEE_SOCKET_PATH`

## One-time setup

```bash
cloudflared access login https://infisical.phantasy.bot
infisical login --domain https://infisical.phantasy.bot/api
infisical init
```

Machine identity / CI:

```bash
export INFISICAL_API_URL=https://infisical.phantasy.bot
export INFISICAL_PROJECT_ID=5d94a3f6-78e6-433e-b4f4-c0099a5f49de
export INFISICAL_MACHINE_CLIENT_ID=<bossraid-phala-ci-client-id>
export INFISICAL_MACHINE_CLIENT_SECRET=<bossraid-phala-ci-client-secret>
export CF_ACCESS_CLIENT_ID=<cloudflare-access-client-id>
export CF_ACCESS_CLIENT_SECRET=<cloudflare-access-client-secret>
```

Do not set `INFISICAL_ORGANIZATION_ID` when using machine identity auth.

Do not commit Infisical auth tokens or `deploy/phala/*.env` files.

## Bootstrap local deploy env

```bash
cp deploy/phala/production.env.example deploy/phala/secrets.core.env
# fill secrets.core.env, optionally secrets.onchain.env
pnpm bootstrap:phala:env
pnpm phala:secrets:check deploy/phala/.env
```

`bootstrap:phala:env` writes:

- `deploy/phala/secrets.core.env`
- `deploy/phala/secrets.onchain.env` (when settlement keys exist)
- `deploy/phala/.env` (assembled compose env)

## Push / pull

```bash
pnpm infisical:phala:push
pnpm infisical:phala:pull
```

Push uploads tier files (or splits `deploy/phala/.env`) into:

- `prod:/bossraid/phala/core`
- `prod:/bossraid/phala/onchain`

Pull downloads both tiers, writes local tier files, and assembles `deploy/phala/.env`.

Migrate off the legacy flat path:

```bash
pnpm infisical:phala:push
pnpm infisical:phala:prune-legacy
```

## Deploy to Phala

```bash
phala deploy --cvm-id bossraid-main \
  --compose deploy/phala/docker-compose.yml \
  -e deploy/phala/.env \
  --wait
```

Secret rotation: `phala envs update bossraid-main -e deploy/phala/.env`.
