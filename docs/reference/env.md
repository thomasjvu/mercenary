# Environment Variables

Grouped reference. Defaults and edge cases live in [operators/runtime.md](../operators/runtime.md).

## Core runtime

| Variable                           | Values / notes                                          |
| ---------------------------------- | ------------------------------------------------------- |
| `BOSSRAID_STORAGE_BACKEND`         | `sqlite` (default) or `memory`                          |
| `BOSSRAID_SQLITE_FILE`             | SQLite path for orchestrator + API state                |
| `BOSSRAID_INFERENCE_RECEIPTS_FILE` | Optional SQLite path for inference attestation receipts |
| `BOSSRAID_PROVIDERS_FILE`          | Provider seed file(s), comma-separated                  |
| `BOSSRAID_PROVIDER_FRESH_MS`       | Routing freshness window                                |
| `BOSSRAID_INVITE_ACCEPT_MS`        | Invite timeout; chat settle grace (5s–30s)              |
| `BOSSRAID_FIRST_HEARTBEAT_MS`      | First heartbeat deadline                                |
| `BOSSRAID_HEARTBEAT_STALE_MS`      | Stale heartbeat timeout                                 |
| `BOSSRAID_HARD_EXECUTION_MS`       | Hard execution cap                                      |
| `BOSSRAID_RAID_ABSOLUTE_MS`        | Absolute raid deadline                                  |
| `PORT`                             | Process listen port                                     |
| `BOSSRAID_DEPLOY_TARGET`           | Label in attestation proof                              |

## API auth & limits

| Variable                                     | Purpose                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `BOSSRAID_ADMIN_TOKEN`                       | Admin bearer + ops session bootstrap                               |
| `BOSSRAID_REGISTRY_TOKEN`                    | `POST /agents/register`                                            |
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
| `BOSSRAID_UPSTREAM_TEE_CLOUD_VERIFY`         | `0` disables Phala Cloud quote verification (default: verify)      |
| `PHALA_CLOUD_ATTESTATION_VERIFY_URL`         | Override Phala Cloud quote verify endpoint                         |
| `BOSSRAID_VENICE_API_KEY`                    | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_REDPILL_API_KEY`                   | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_NEAR_API_KEY`                      | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_CHUTES_API_KEY`                    | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_PHALA_API_KEY`                     | Optional platform key for catalog TEE attest                       |
| `BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS`        | Health probe timeout                                               |
| `BOSSRAID_TRUST_PROXY`                       | Trust forwarded headers                                            |
| `BOSSRAID_METRICS_PUBLIC`                    | `true` exposes `/metrics` without admin auth (default: admin only) |

## x402

| Variable                                       | Purpose                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `BOSSRAID_X402_ENABLED`                        | Default `false`; ops toggle overrides live                                                       |
| `BOSSRAID_X402_PAY_TO`                         | Treasury wallet                                                                                  |
| `BOSSRAID_X402_RAID_SURCHARGE_USD`             | Flat raid surcharge (default `0.01`)                                                             |
| `BOSSRAID_X402_CHAT_SURCHARGE_USD`             | Flat chat/inference surcharge (default `0.002`)                                                  |
| `BOSSRAID_X402_PLATFORM_MARKUP_BPS`            | Platform markup (default `100` = 1%)                                                             |
| `BOSSRAID_X402_NETWORK`, `BOSSRAID_X402_ASSET` | Payment asset config                                                                             |
| `BOSSRAID_X402_FACILITATOR_PRESET`             | `metamask_base_mainnet` or `metamask_base_sepolia` for cookoff facilitator                       |
| `BOSSRAID_X402_FACILITATOR_URL`                | Override facilitator URL (MetaMask tx-sentinel or PayAI)                                         |
| `BOSSRAID_X402_ASSET_TRANSFER_METHOD`          | `permit2` (default) or `erc7710` for ERC-7710 delegation payments                                |
| `BOSSRAID_DELEGATION_MANAGER_ADDRESS`          | ERC-7710 delegation manager on Base; falls back to MetaMask permission `signerMeta` when omitted |
| `BOSSRAID_X402_BUYER_PRIVATE_KEY`              | Wallet smoke tests and MCP agent one-shot payments                                               |
| `BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND`       | Local dev only: allow `POST /v1/buyer/balance/fund` without x402 when payments are disabled      |
| `PAYAI_API_KEY_ID`, `PAYAI_API_KEY_SECRET`     | PayAI facilitator                                                                                |
| `CDP_API_KEY_*`                                | CDP fallback                                                                                     |

## MetaMask cookoff / agent payments

| Variable                       | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `BOSSRAID_ONESHOT_RELAYER_URL` | 1Shot relayer JSON-RPC base (`/v1/relayer/*` proxies this) |
| `BOSSRAID_AGENT_WALLET_KEY`    | Funded agent wallet for MCP paid raids and redelegation    |
| `BOSSRAID_VENICE_API_KEY`      | Mercenary direct Venice planner/synthesis                  |
| `BOSSRAID_VENICE_MODEL`        | Venice model id (default `minimax-m27`)                    |
| `BOSSRAID_VENICE_WALLET_KEY`   | Venice x402 wallet for provider upstream calls             |

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

| Variable                            | Purpose                                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| `BOSSRAID_API_ORIGIN`               | Gateway/Pages proxy target                                            |
| `VITE_BOSSRAID_*`                   | Web/ops Vite prefixes                                                 |
| `VITE_BOSSRAID_PUBLIC_WEB_ORIGIN`   | Ops deep links to buyer web when web and ops run on different origins |
| `BOSSRAID_CLOUDFLARE_PAGES_PROJECT` | Pages deploy (default project: `bossraid-web`)                        |
| `BOSSRAID_CLOUDFLARE_PAGES_BRANCH`  | Optional Pages preview branch                                         |

## Mana Core (trusted clients)

| Variable                    | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `BOSSRAID_MANA_CORE_URL`    | Mana Core API                                 |
| `BOSSRAID_MANA_CORE_KEY`    | Internal key                                  |
| `BOSSRAID_MANA_CORE_APP_ID` | Mana reservation `appId` (default `bossraid`) |
| `BOSSRAID_API_KEY`          | Trusted client bearer                         |

## Local smoke & dev providers

| Variable                      | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `BOSSRAID_API_BASE`           | API origin for smoke scripts (default `127.0.0.1:8787`) |
| `BOSSRAID_CALLBACK_BASE`      | Provider callback URL in local dev                      |
| `BOSSRAID_PROVIDER_STUB_MODE` | `1` = stub upstream responses in `dev:providers`        |
| `BOSSRAID_SMOKE_MNEMONIC`     | Deterministic wallet for parity smoke                   |
| `BOSSRAID_SMOKE_MODEL`        | Model id for inference smoke step                       |
| `BOSSRAID_SMOKE_TIMEOUT_MS`   | Inference smoke timeout (default `120000`)              |
| `BOSSRAID_API_KEY`            | Trusted client bearer (Alkahest strict Gemma lane)      |

## Demo video generation (local, `.private/`)

| Variable             | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `VENICE_API_KEY`     | Venice image edit + image-to-video for OC regen         |
| `VENICE_VIDEO_MODEL` | Video model override (default `wan-2-7-image-to-video`) |

Stored in `.private/.env` (untracked). Used by `pnpm generate:legal-character`.

## Production acknowledgements

| Variable                         | Purpose                   |
| -------------------------------- | ------------------------- |
| `BOSSRAID_OPERATOR_TERMS_ACK`    | Production-readiness gate |
| `BOSSRAID_INCIDENT_RESPONSE_ACK` | Production-readiness gate |
