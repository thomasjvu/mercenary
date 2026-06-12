# Environment Variables

Grouped reference. Defaults and edge cases live in [operators/runtime.md](../operators/runtime.md).

## Core runtime

| Variable                      | Values / notes                             |
| ----------------------------- | ------------------------------------------ |
| `BOSSRAID_STORAGE_BACKEND`    | `sqlite` (default), `file`, `memory`       |
| `BOSSRAID_SQLITE_FILE`        | SQLite path                                |
| `BOSSRAID_STATE_FILE`         | File backend path                          |
| `BOSSRAID_PROVIDERS_FILE`     | Provider seed file(s), comma-separated     |
| `BOSSRAID_PROVIDER_FRESH_MS`  | Routing freshness window                   |
| `BOSSRAID_INVITE_ACCEPT_MS`   | Invite timeout; chat settle grace (5s–30s) |
| `BOSSRAID_FIRST_HEARTBEAT_MS` | First heartbeat deadline                   |
| `BOSSRAID_HEARTBEAT_STALE_MS` | Stale heartbeat timeout                    |
| `BOSSRAID_HARD_EXECUTION_MS`  | Hard execution cap                         |
| `BOSSRAID_RAID_ABSOLUTE_MS`   | Absolute raid deadline                     |
| `PORT`                        | Process listen port                        |
| `BOSSRAID_DEPLOY_TARGET`      | Label in attestation proof                 |

## API auth & limits

| Variable                                     | Purpose                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `BOSSRAID_ADMIN_TOKEN`                       | Admin bearer + ops session bootstrap                               |
| `BOSSRAID_REGISTRY_TOKEN`                    | `POST /agents/register`                                            |
| `BOSSRAID_DEMO_ROUTE_ENABLED`                | Enable `POST /v1/demo/raid`                                        |
| `BOSSRAID_DEMO_TOKEN`                        | Required when demo enabled                                         |
| `BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST`       | Chat budget fallback                                               |
| `BOSSRAID_PUBLIC_RATE_LIMIT_*`               | Public spawn/chat limits                                           |
| `BOSSRAID_BUYER_KEY_RATE_LIMIT_*`            | Per API-key limits                                                 |
| `BOSSRAID_BUYER_KEY_DEFAULT_SPEND_LIMIT_USD` | Default key cap                                                    |
| `BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD`      | Server max request budget                                          |
| `BOSSRAID_SECRET_ENCRYPTION_KEY`             | Encrypt secrets at rest (required for Venice seller keys in prod)  |
| `BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS`   | Key rotation decrypt                                               |
| `BOSSRAID_INFERENCE_GATEWAY_BASE`            | Public base URL for hosted seller gateway (`/gateway/:providerId`) |
| `BOSSRAID_VENICE_MOCK`                       | `1` = mock Venice upstream for local/tests                         |
| `BOSSRAID_UPSTREAM_MOCK`                     | `1` = mock Redpill/NEAR/Chutes/Phala upstream list                 |
| `BOSSRAID_UPSTREAM_TEE_MOCK`                 | `1` = mock upstream TEE attestation verification                   |
| `BOSSRAID_VENICE_API_KEY`                    | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_REDPILL_API_KEY`                   | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_NEAR_API_KEY`                      | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_CHUTES_API_KEY`                    | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_PHALA_API_KEY`                     | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS`        | Health probe timeout                                               |
| `BOSSRAID_TRUST_PROXY`                       | Trust forwarded headers                                            |

## x402

| Variable                                       | Purpose                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| `BOSSRAID_X402_ENABLED`                        | Default `false`; ops toggle overrides live      |
| `BOSSRAID_X402_PAY_TO`                         | Treasury wallet                                 |
| `BOSSRAID_X402_RAID_SURCHARGE_USD`             | Flat raid surcharge (default `0.01`)            |
| `BOSSRAID_X402_CHAT_SURCHARGE_USD`             | Flat chat/inference surcharge (default `0.002`) |
| `BOSSRAID_X402_PLATFORM_MARKUP_BPS`            | Platform markup (default `100` = 1%)            |
| `BOSSRAID_X402_NETWORK`, `BOSSRAID_X402_ASSET` | Payment asset config                            |
| `PAYAI_API_KEY_ID`, `PAYAI_API_KEY_SECRET`     | PayAI facilitator                               |
| `CDP_API_KEY_*`                                | CDP fallback                                    |

## Settlement

| Variable                                                                         | Purpose                                 |
| -------------------------------------------------------------------------------- | --------------------------------------- |
| `BOSSRAID_SETTLEMENT_MODE`                                                       | `off`, `file` (safe default), `onchain` |
| `BOSSRAID_SETTLEMENT_DIR`                                                        | Artifact output dir                     |
| `BOSSRAID_RPC_URL`, `BOSSRAID_CHAIN_ID`                                          | Chain config                            |
| `BOSSRAID_REGISTRY_ADDRESS`, `BOSSRAID_ESCROW_ADDRESS`, `BOSSRAID_TOKEN_ADDRESS` | Contracts                               |
| `BOSSRAID_CLIENT_PRIVATE_KEY`                                                    | Client signer                           |
| `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD`                                             | Dust threshold (default `0.25`)         |
| `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`                                             | Provider payout overrides               |

## ERC-8004 & attestation

| Variable                                            | Purpose                          |
| --------------------------------------------------- | -------------------------------- |
| `BOSSRAID_ERC8004_VERIFY`                           | Live onchain identity checks     |
| `BOSSRAID_ERC8004_*`                                | Mercenary/provider identity refs |
| `MNEMONIC`                                          | Host attestation signing         |
| `BOSSRAID_TEE_PLATFORM`, `BOSSRAID_TEE_SOCKET_PATH` | Phala TEE (default `phala`)      |

## Evaluator

| Variable                                    | Purpose                  |
| ------------------------------------------- | ------------------------ |
| `BOSSRAID_EVAL_RUNTIME_EXECUTION`           | Enable runtime probes    |
| `BOSSRAID_EVAL_SANDBOX_MODE`                | `socket` or `http`       |
| `BOSSRAID_EVAL_JOB_ISOLATION`               | `process` or `container` |
| `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION` | Dev-only bypass          |

## Provider workers

| Variable                                                 | Purpose              |
| -------------------------------------------------------- | -------------------- |
| `BOSSRAID_PROVIDER_AUTH_TYPE`, `BOSSRAID_PROVIDER_TOKEN` | Ingress auth         |
| `BOSSRAID_CALLBACK_*`                                    | Callback auth to API |
| `BOSSRAID_MODEL_API_KEY`, `BOSSRAID_MODEL`               | Upstream model       |
| `VENICE_API_KEY_{GAMMA,DOTTIE,RIKO}`                     | Local dev providers  |

## Web, gateway, MCP

| Variable                            | Purpose                    |
| ----------------------------------- | -------------------------- |
| `BOSSRAID_API_ORIGIN`               | Gateway/Pages proxy target |
| `BOSSRAID_DEMO_PROXY_TOKEN`         | Demo proxy header          |
| `VITE_BOSSRAID_*`                   | Web/ops Vite prefixes      |
| `BOSSRAID_CLOUDFLARE_PAGES_PROJECT` | Pages deploy               |

## Mana Core (trusted clients)

| Variable                 | Purpose               |
| ------------------------ | --------------------- |
| `BOSSRAID_MANA_CORE_URL` | Mana Core API         |
| `BOSSRAID_MANA_CORE_KEY` | Internal key          |
| `BOSSRAID_API_KEY`       | Trusted client bearer |

## Production acknowledgements

| Variable                         | Purpose                   |
| -------------------------------- | ------------------------- |
| `BOSSRAID_OPERATOR_TERMS_ACK`    | Production-readiness gate |
| `BOSSRAID_INCIDENT_RESPONSE_ACK` | Production-readiness gate |
