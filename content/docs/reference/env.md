# Environment Variables

Grouped reference. Defaults and edge cases live in [operators/runtime.md](../operators/runtime.md).

## Core runtime

| Variable                                 | Values / notes                                            |
| ---------------------------------------- | --------------------------------------------------------- |
| `BOSSRAID_STORAGE_BACKEND`               | `sqlite` (default) or `memory`                            |
| `BOSSRAID_SQLITE_FILE`                   | SQLite path for orchestrator + API state                  |
| `BOSSRAID_INFERENCE_RECEIPTS_FILE`       | Optional SQLite path for inference attestation receipts   |
| `BOSSRAID_BOUNTY_SQLITE_FILE`            | SQLite path for bounty marketplace state                  |
| `BOSSRAID_BOUNTY_DEADLINE_INTERVAL_MS`   | Bounty auto-award / claim worker interval (default 60000) |
| `BOSSRAID_BOUNTY_DEFAULT_BIDDING_DAYS`   | Default bidding window (default 7)                        |
| `BOSSRAID_BOUNTY_DEFAULT_AWARD_DAYS`     | Default award window after bidding (default 3)            |
| `BOSSRAID_BOUNTY_DEFAULT_DELIVERY_DAYS`  | Default delivery window (default 14)                      |
| `BOSSRAID_BOUNTY_DEFAULT_ACCEPT_DAYS`    | Permissionless claim window (default 7)                   |
| `BOSSRAID_BOUNTY_AUTO_AWARD_MAX`         | Max bids auto-awarded (default 3)                         |
| `BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND`  | Dev-only: fund bounties without x402 (default off)        |
| `BOSSRAID_BOUNTY_E2E_PROVIDER_ID`        | Bounty smoke provider override (default `dottie`)         |
| `BOSSRAID_BOUNTY_E2E_PROVIDER_TOKEN`     | Bounty smoke bearer token (default `bossraid-provider-a`) |
| `BOSSRAID_BOUNTY_E2E_REWARD_USD`         | Bounty smoke reward amount (default `0.5`)                |
| `BOSSRAID_BOUNTY_E2E_MODE`               | `mock`, `wallet`, or `unverified` for bounty smoke        |
| `BOSSRAID_BOUNTY_E2E_POSTER_PRIVATE_KEY` | Poster wallet for bounty smoke (`wallet` mode)            |
| `BOSSRAID_PROVIDERS_FILE`                | Provider seed file(s), comma-separated                    |
| `BOSSRAID_PROVIDER_FRESH_MS`             | Routing freshness window                                  |
| `BOSSRAID_INVITE_ACCEPT_MS`              | Invite timeout; chat settle grace (5s–30s)                |
| `BOSSRAID_FIRST_HEARTBEAT_MS`            | First heartbeat deadline                                  |
| `BOSSRAID_HEARTBEAT_STALE_MS`            | Stale heartbeat timeout                                   |
| `BOSSRAID_HARD_EXECUTION_MS`             | Hard execution cap                                        |
| `BOSSRAID_RAID_ABSOLUTE_MS`              | Absolute raid deadline                                    |
| `PORT`                                   | Process listen port                                       |
| `BOSSRAID_DEPLOY_TARGET`                 | Label in attestation proof                                |

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

| Variable                                       | Purpose                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BOSSRAID_X402_ENABLED`                        | Default `false`; ops toggle overrides live                                                                   |
| `BOSSRAID_X402_PAY_TO`                         | Treasury wallet                                                                                              |
| `BOSSRAID_X402_RAID_SURCHARGE_USD`             | Flat raid surcharge (default `0.01`)                                                                         |
| `BOSSRAID_X402_CHAT_SURCHARGE_USD`             | Flat chat/inference surcharge (default `0.002`)                                                              |
| `BOSSRAID_X402_PLATFORM_MARKUP_BPS`            | Platform markup (default `100` = 1%)                                                                         |
| `BOSSRAID_X402_NETWORK`, `BOSSRAID_X402_ASSET` | Payment asset config                                                                                         |
| `BOSSRAID_X402_FACILITATOR_PRESET`             | `metamask_base_mainnet` or `metamask_base_sepolia` for cookoff facilitator                                   |
| `BOSSRAID_X402_FACILITATOR_URL`                | Override facilitator URL (MetaMask tx-sentinel or PayAI)                                                     |
| `BOSSRAID_X402_ASSET_TRANSFER_METHOD`          | `permit2` (default) or `erc7710` for ERC-7710 delegation payments                                            |
| `BOSSRAID_DELEGATION_MANAGER_ADDRESS`          | ERC-7710 delegation manager on Base; falls back to MetaMask permission `signerMeta` when omitted             |
| `BOSSRAID_X402_BUYER_PRIVATE_KEY`              | Wallet smoke tests and MCP agent one-shot payments                                                           |
| `BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND`       | **Test/dev only.** Never set in production. Allows unverified `POST /v1/buyer/balance/fund` when x402 is off |
| `PAYAI_API_KEY_ID`, `PAYAI_API_KEY_SECRET`     | PayAI facilitator                                                                                            |
| `CDP_API_KEY_*`                                | CDP fallback                                                                                                 |

## MetaMask cookoff / agent payments

| Variable                                  | Purpose                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `BOSSRAID_ONESHOT_RELAYER_URL`            | 1Shot relayer JSON-RPC base (`/v1/relayer/*` proxies this)                                        |
| `BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET` | Shared secret for `POST /v1/relayer/webhook` (`X-BossRaid-Relayer-Webhook-Secret` header)         |
| `BOSSRAID_AGENT_WALLET_KEY`               | Funded agent wallet for MCP paid raids and redelegation                                           |
| `BOSSRAID_VENICE_API_KEY`                 | Shared Venice upstream key (Phala providers + Mercenary planner/synthesis)                        |
| `BOSSRAID_MERCENARY_BASE_MODEL`           | Mercenary chat planner base model (default `e2ee-gemma-4-31b`; E2EE first, plain Venice fallback) |
| `BOSSRAID_VENICE_MODEL`                   | Venice model id (default `minimax-m27`)                                                           |
| `BOSSRAID_VENICE_WALLET_KEY`              | Venice x402 wallet for provider upstream calls                                                    |

## Phala Infisical tiers

Boss Raid stores **14 core secrets** at `prod:/bossraid/phala/core` and an optional
onchain overlay at `prod:/bossraid/phala/onchain`. Templates:
`deploy/phala/secrets.core.env.example` and `deploy/phala/secrets.onchain.env.example`.
Bootstrap assembles `deploy/phala/.env` with compose defaults that are not stored in Infisical.

Core tier keys:

| Variable                                                                                                           | Purpose                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `BOSSRAID_IMAGE`, `BOSSRAID_EVALUATOR_IMAGE`, `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE`                                  | Deploy image refs                                       |
| `BOSSRAID_ADMIN_TOKEN`, `BOSSRAID_REGISTRY_TOKEN`, `BOSSRAID_SECRET_ENCRYPTION_KEY`, `BOSSRAID_EVAL_SANDBOX_TOKEN` | Platform auth                                           |
| `BOSSRAID_PROVIDER_A/B/C_TOKEN`                                                                                    | In-CVM provider ingress tokens                          |
| `BOSSRAID_VENICE_API_KEY`                                                                                          | Shared upstream inference key for all 3 Phala providers |
| `BOSSRAID_X402_PAY_TO`, `PAYAI_API_KEY_ID`, `PAYAI_API_KEY_SECRET`                                                 | Paid traffic                                            |

Workflow: [operators/appendix/infisical.md](../operators/appendix/infisical.md).

## Settlement

| Variable                                                                                                           | Purpose                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `BOSSRAID_SETTLEMENT_MODE`                                                                                         | `off`, `file` (safe default), `onchain`                                                     |
| `BOSSRAID_SETTLEMENT_DIR`                                                                                          | Artifact output dir                                                                         |
| `BOSSRAID_RPC_URL`, `BOSSRAID_CHAIN_ID`                                                                            | Chain config                                                                                |
| `BOSSRAID_REGISTRY_ADDRESS`, `BOSSRAID_ESCROW_ADDRESS`, `BOSSRAID_BOUNTY_ESCROW_ADDRESS`, `BOSSRAID_TOKEN_ADDRESS` | Contracts                                                                                   |
| `BOSSRAID_CLIENT_PRIVATE_KEY`                                                                                      | Client signer (raid + bounty relayer)                                                       |
| `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD`                                                                               | Dust threshold (default `0.25`)                                                             |
| `BOSSRAID_SETTLEMENT_FUND_JOBS`                                                                                    | Fund successful child jobs onchain (`true` required in production onchain mode)             |
| `BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS`                                                                        | Block parent settlement until child jobs are terminal (`true` required in production audit) |
| `BOSSRAID_SETTLEMENT_RETRY_INTERVAL_MS`                                                                            | Orchestrator settlement retry worker interval (default `60000`; `0` disables)               |
| `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`                                                                               | Provider payout overrides                                                                   |

## ERC-8004 & attestation

| Variable                              | Purpose                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOSSRAID_ERC8004_VERIFY`             | Live onchain identity checks                                                                                                                                                 |
| `BOSSRAID_ERC8004_*`                  | Mercenary/provider identity refs                                                                                                                                             |
| `MNEMONIC`                            | Signs host `signedRuntime` envelopes (`GET /v1/host/attestation`, admin `GET /v1/attested-runtime`, raid `GET /v1/raid/:raidId/attested-result`); does not set `teeVerified` |
| `BOSSRAID_TEE_PLATFORM`               | Host TEE platform label (`phala`, `eigencompute`, etc.)                                                                                                                      |
| `BOSSRAID_TEE_RUNTIME_MODE`           | Runtime mode recorded in TEE attestations (default `phala-cvm`)                                                                                                              |
| `BOSSRAID_TEE_SOCKET_PATH`            | Phala dstack guest agent socket (default `/var/run/dstack.sock`)                                                                                                             |
| `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY` | `1` = structural TDX verify only on host route; unset = Phala Cloud verify. **Blocked in production** (`NODE_ENV=production` + production-readiness)                         |
| `BOSSRAID_UPSTREAM_TEE_CLOUD_VERIFY`  | `0` disables cloud verify for marketplace/upstream TEE paths                                                                                                                 |
| `BOSSRAID_PRIVACY_SERVER_VERIFY`      | `0` = dev-only: skip server-side provider privacy attestation re-verify. **Blocked in production**                                                                           |

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

| Variable                        | Purpose                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `BOSSRAID_API_BASE`             | API origin for smoke scripts (default `127.0.0.1:8787`) |
| `BOSSRAID_CALLBACK_BASE`        | Provider callback URL in local dev                      |
| `BOSSRAID_PROVIDER_STUB_MODE`   | `1` = stub upstream responses in `dev:providers`        |
| `BOSSRAID_SMOKE_TIMEOUT_MS`     | Party quest smoke timeout (default `600000`)            |
| `BOSSRAID_SMOKE_PAYLOAD_FILE`   | Optional raid payload JSON for party quest smoke        |
| `BOSSRAID_SMOKE_MAX_TOTAL_COST` | Max raid cost for party quest smoke (default `1`)       |
| `BOSSRAID_API_KEY`              | Trusted client bearer (Alkahest strict Gemma lane)      |

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
