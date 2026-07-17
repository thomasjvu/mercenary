# Environment Variables

Boss Raid reads env vars across the API, orchestrator, provider workers, and deploy scripts. **Production operators only need the Phala core tier** (core Infisical secrets). Everything else is tuning, feature flags, or local dev.

Defaults and workflows: [operators/runtime.md](../operators/runtime.md). Local setup: [dev-docs/operators/local-development](/dev-docs/operators/local-development).

## Start here (production)

Phala deploy stores **15 core secrets** at `prod:/bossraid/phala/core` plus an optional onchain overlay at `prod:/bossraid/phala/onchain`.

Template: `deploy/phala/secrets.core.env.example`. Workflow: [Infisical secrets](/dev-docs/operators/infisical).

| Variable                                                                                                           | Purpose                                                  |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `MNEMONIC`                                                                                                         | Signs host runtime envelopes (production-readiness gate) |
| `BOSSRAID_IMAGE`, `BOSSRAID_EVALUATOR_IMAGE`, `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE`                                  | Deploy image refs                                        |
| `BOSSRAID_ADMIN_TOKEN`, `BOSSRAID_REGISTRY_TOKEN`, `BOSSRAID_SECRET_ENCRYPTION_KEY`, `BOSSRAID_EVAL_SANDBOX_TOKEN` | Platform auth                                            |
| `BOSSRAID_PROVIDER_A/B/C_TOKEN`                                                                                    | In-CVM provider ingress tokens                           |
| `BOSSRAID_VENICE_API_KEY`                                                                                          | Shared upstream inference key for all 3 Phala providers  |
| `BOSSRAID_X402_PAY_TO`, `PAYAI_API_KEY_ID`, `PAYAI_API_KEY_SECRET`                                                 | Paid traffic                                             |

Bootstrap assembles `deploy/phala/.env` with compose defaults not stored in Infisical: `pnpm bossraid bootstrap:phala:env`.

## Tier 1 — Core runtime

| Variable                                | Values / notes                                            |
| --------------------------------------- | --------------------------------------------------------- |
| `BOSSRAID_STORAGE_BACKEND`              | `sqlite` (default) or `memory`                            |
| `BOSSRAID_SQLITE_FILE`                  | SQLite path for orchestrator + API state                  |
| `BOSSRAID_INFERENCE_RECEIPTS_FILE`      | Optional SQLite path for inference attestation receipts   |
| `BOSSRAID_BOUNTY_SQLITE_FILE`           | SQLite path for bounty marketplace state                  |
| `BOSSRAID_BOUNTY_DEADLINE_INTERVAL_MS`  | Bounty auto-award / claim worker interval (default 60000) |
| `BOSSRAID_BOUNTY_DEFAULT_BIDDING_DAYS`  | Default bidding window (default 7)                        |
| `BOSSRAID_BOUNTY_DEFAULT_AWARD_DAYS`    | Default award window after bidding (default 3)            |
| `BOSSRAID_BOUNTY_DEFAULT_DELIVERY_DAYS` | Default delivery window (default 14)                      |
| `BOSSRAID_BOUNTY_DEFAULT_ACCEPT_DAYS`   | Permissionless claim window (default 7)                   |
| `BOSSRAID_BOUNTY_AUTO_AWARD_MAX`        | Max bids auto-awarded (default 3)                         |
| `BOSSRAID_PROVIDERS_FILE`               | Provider seed file(s), comma-separated                    |
| `BOSSRAID_PROVIDER_FRESH_MS`            | Routing freshness window                                  |
| `BOSSRAID_INVITE_ACCEPT_MS`             | Invite timeout; chat settle grace (5s–30s)                |
| `BOSSRAID_FIRST_HEARTBEAT_MS`           | First heartbeat deadline                                  |
| `BOSSRAID_HEARTBEAT_STALE_MS`           | Stale heartbeat timeout                                   |
| `BOSSRAID_HARD_EXECUTION_MS`            | Hard execution cap                                        |
| `BOSSRAID_RAID_ABSOLUTE_MS`             | Absolute raid deadline                                    |
| `PORT`                                  | Process listen port                                       |
| `BOSSRAID_DEPLOY_TARGET`                | Label in attestation proof                                |

## Tier 2 — API auth, limits, gateway

| Variable                                     | Purpose                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `BOSSRAID_ADMIN_TOKEN`                       | Admin bearer + ops session bootstrap                                |
| `BOSSRAID_REGISTRY_TOKEN`                    | `POST /agents/register`                                             |
| `BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST`       | Chat budget fallback                                                |
| `BOSSRAID_PUBLIC_RATE_LIMIT_*`               | Public spawn/chat limits                                            |
| `BOSSRAID_BUYER_KEY_RATE_LIMIT_*`            | Per API-key limits                                                  |
| `BOSSRAID_BUYER_KEY_DEFAULT_SPEND_LIMIT_USD` | Default key cap (default `25`; production-readiness gate)           |
| `BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD`      | Server max request budget (default `50`; production-readiness gate) |
| `BOSSRAID_SECRET_ENCRYPTION_KEY`             | Encrypt secrets at rest (required for Venice seller keys in prod)   |
| `BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS`   | Key rotation decrypt                                                |
| `BOSSRAID_INFERENCE_GATEWAY_BASE`            | Public base URL for hosted seller gateway (`/gateway/:providerId`)  |
| `BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS`        | Health probe timeout                                                |
| `BOSSRAID_TRUST_PROXY`                       | Trust forwarded headers                                             |
| `BOSSRAID_METRICS_PUBLIC`                    | `true` exposes `/metrics` without admin auth (default: admin only)  |

## Tier 3 — Payments (x402, agent wallet, settlement)

### x402

| Variable                                                  | Purpose                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BOSSRAID_X402_ENABLED`                                   | Default `false`; ops toggle overrides live                                                                   |
| `BOSSRAID_X402_PAY_TO`                                    | Treasury wallet                                                                                              |
| `BOSSRAID_X402_RAID_SURCHARGE_USD`                        | Flat raid surcharge (default `0.01`)                                                                         |
| `BOSSRAID_X402_CHAT_SURCHARGE_USD`                        | Flat chat/inference surcharge (default `0.002`)                                                              |
| `BOSSRAID_X402_PLATFORM_MARKUP_BPS`                       | Platform markup (default `100` = 1%)                                                                         |
| `BOSSRAID_X402_NETWORK`, `BOSSRAID_X402_ASSET`            | **Required rail:** `eip155:4663` + `usdg` (Robinhood / USDG) only                                            |
| `BOSSRAID_X402_ASSET_NAME`, `BOSSRAID_X402_ASSET_VERSION` | USDG EIP-712: `Global Dollar` / `1`                                                                          |
| `BOSSRAID_X402_FACILITATOR_URL`                           | **Marian** facilitator URL (Surplus RH+USDG) — required when x402 is enabled                                 |
| `BOSSRAID_X402_FACILITATOR_API_KEY`                       | Marian console API key for verify/settle                                                                     |
| `BOSSRAID_X402_REQUIRE_ONCHAIN_VERIFY`                    | Force receipt verify outside production (`1`/`true`); production always requires RPC + tx                    |
| `BOSSRAID_RPC_URL` / `BOSSRAID_ROBINHOOD_RPC_URL`         | Robinhood RPC for settle verify + seller USDG treasury flush                                                 |
| `BOSSRAID_SETTLEMENT_TREASURY_KEY`                        | Hot wallet for automatic seller USDG batch transfers (fallback: `BOSSRAID_CLIENT_PRIVATE_KEY`)               |
| `BOSSRAID_X402_FACILITATOR_PRESET`                        | Removed — set `BOSSRAID_X402_FACILITATOR_URL` (Marian) explicitly                                            |
| `BOSSRAID_X402_ASSET_TRANSFER_METHOD`                     | `permit2` (default); `erc7710` only for optional agent-session grants                                        |
| `BOSSRAID_DELEGATION_MANAGER_ADDRESS`                     | ERC-7710 delegation manager on Base; falls back to wallet permission `signerMeta` when omitted               |
| `BOSSRAID_X402_BUYER_PRIVATE_KEY`                         | Wallet smoke tests and MCP agent one-shot payments                                                           |
| `BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND`                  | **Test/dev only.** Never set in production. Allows unverified `POST /v1/buyer/balance/fund` when x402 is off |
| ~~`PAYAI_*` / CDP\_\*~~                                   | Removed from production rail                                                                                 |
| `CDP_API_KEY_*`                                           | CDP fallback (legacy)                                                                                        |

### Agent payments & Mercenary upstream

| Variable                                  | Purpose                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `BOSSRAID_ONESHOT_RELAYER_URL`            | 1Shot relayer JSON-RPC base (`/v1/relayer/*` proxies this)                                        |
| `BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET` | Shared secret for `POST /v1/relayer/webhook` (`X-BossRaid-Relayer-Webhook-Secret` header)         |
| `BOSSRAID_AGENT_WALLET_KEY`               | Funded agent wallet for MCP paid raids and redelegation                                           |
| `BOSSRAID_MERCENARY_BASE_MODEL`           | Mercenary chat planner base model (default `e2ee-gemma-4-31b`; E2EE first, plain Venice fallback) |
| `BOSSRAID_VENICE_MODEL`                   | Venice model id (default `minimax-m27`)                                                           |
| `BOSSRAID_VENICE_WALLET_KEY`              | Venice x402 wallet for provider upstream calls                                                    |

### Settlement

| Variable                                                                                                           | Purpose                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `BOSSRAID_SETTLEMENT_MODE`                                                                                         | `off`, `file` (safe default), `onchain`                                                     |
| `BOSSRAID_SETTLEMENT_DIR`                                                                                          | Artifact output dir                                                                         |
| `BOSSRAID_RPC_URL`, `BOSSRAID_CHAIN_ID`                                                                            | Chain config                                                                                |
| `BOSSRAID_REGISTRY_ADDRESS`, `BOSSRAID_ESCROW_ADDRESS`, `BOSSRAID_BOUNTY_ESCROW_ADDRESS`, `BOSSRAID_TOKEN_ADDRESS` | Contracts                                                                                   |
| `BOSSRAID_CLIENT_PRIVATE_KEY`                                                                                      | Client signer (raid + bounty relayer)                                                       |
| `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD`                                                                               | On-chain transfer floor (default `1`); ledger still credits below this                      |
| `BOSSRAID_SETTLEMENT_FUND_JOBS`                                                                                    | Fund successful child jobs onchain (`true` required in production onchain mode)             |
| `BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS`                                                                        | Block parent settlement until child jobs are terminal (`true` required in production audit) |
| `BOSSRAID_SETTLEMENT_RETRY_INTERVAL_MS`                                                                            | Orchestrator settlement retry worker interval (default `60000`; `0` disables)               |
| `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`                                                                               | Provider payout overrides                                                                   |

Onchain overlay template: `deploy/phala/secrets.onchain.env.example`.

## Tier 4 — TEE & attestation

| Variable                              | Purpose                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOSSRAID_ERC8004_VERIFY`             | Live onchain identity checks                                                                                                                                                                                                                                                                        |
| `BOSSRAID_ERC8004_*`                  | Mercenary/provider identity refs                                                                                                                                                                                                                                                                    |
| `MNEMONIC`                            | Signs host `signedRuntime` envelopes (`GET /v1/host/attestation`, admin `GET /v1/attested-runtime`, raid `GET /v1/raid/:raidId/attested-result`); does not set `teeVerified`. **Required on Phala production** (`mnemonic_configured` production-readiness gate). Phala core Infisical tier secret. |
| `BOSSRAID_TEE_PLATFORM`               | Host TEE platform label (`phala`, `eigencompute`, etc.)                                                                                                                                                                                                                                             |
| `BOSSRAID_TEE_RUNTIME_MODE`           | Runtime mode recorded in TEE attestations (default `phala-cvm`)                                                                                                                                                                                                                                     |
| `BOSSRAID_TEE_SOCKET_PATH`            | Phala dstack guest agent socket (default `/var/run/dstack.sock`; set `/var/run/tappd.sock` on legacy tappd-only hosts)                                                                                                                                                                              |
| `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY` | `1` = structural TDX verify only on host route; unset = Phala Cloud verify. **Blocked in production** (`NODE_ENV=production` + production-readiness)                                                                                                                                                |
| `BOSSRAID_UPSTREAM_TEE_CLOUD_VERIFY`  | `0` disables cloud verify for marketplace/upstream TEE paths                                                                                                                                                                                                                                        |
| `BOSSRAID_PRIVACY_SERVER_VERIFY`      | `0` = dev-only: skip server-side provider privacy attestation re-verify. **Blocked in production**                                                                                                                                                                                                  |
| `PHALA_CLOUD_ATTESTATION_VERIFY_URL`  | Override Phala Cloud quote verify endpoint                                                                                                                                                                                                                                                          |

## Tier 5 — Feature toggles & integrations

### Mocks (non-production)

| Variable                                | Purpose                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `BOSSRAID_VENICE_MOCK`                  | `1` = mock Venice upstream for local/tests           |
| `BOSSRAID_XAI_MOCK`                     | `1` = mock xAI/Grok upstream for local/tests         |
| `BOSSRAID_ZAI_MOCK`                     | `1` = mock Z.ai/GLM upstream for local/tests         |
| `BOSSRAID_ANTHROPIC_MOCK`               | `1` = mock Anthropic/Claude upstream for local/tests |
| `BOSSRAID_UPSTREAM_MOCK`                | `1` = mock all hosted upstreams including Anthropic  |
| `BOSSRAID_UPSTREAM_TEE_MOCK`            | `1` = mock upstream TEE attestation verification     |
| `BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND` | Dev-only: fund bounties without x402 (default off)   |

### Catalog TEE platform keys (optional)

`BOSSRAID_VENICE_API_KEY`, `BOSSRAID_REDPILL_API_KEY`, `BOSSRAID_NEAR_API_KEY`, `BOSSRAID_CHUTES_API_KEY`, `BOSSRAID_PHALA_API_KEY`, `BOSSRAID_XAI_API_KEY`, `BOSSRAID_ZAI_API_KEY`, `BOSSRAID_ANTHROPIC_API_KEY` — platform keys for catalog inference/TEE when sellers do not supply their own. Optional `BOSSRAID_ZAI_API_BASE` / `BOSSRAID_ANTHROPIC_API_BASE` override default OpenAI-compatible base URLs.

### Evaluator

| Variable                                    | Purpose                  |
| ------------------------------------------- | ------------------------ |
| `BOSSRAID_EVAL_RUNTIME_EXECUTION`           | Enable runtime probes    |
| `BOSSRAID_EVAL_SANDBOX_MODE`                | `socket` or `http`       |
| `BOSSRAID_EVAL_JOB_ISOLATION`               | `process` or `container` |
| `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION` | Dev-only bypass          |

### Provider workers

| Variable                                                 | Purpose              |
| -------------------------------------------------------- | -------------------- |
| `BOSSRAID_PROVIDER_AUTH_TYPE`, `BOSSRAID_PROVIDER_TOKEN` | Ingress auth         |
| `BOSSRAID_CALLBACK_*`                                    | Callback auth to API |
| `BOSSRAID_MODEL_API_KEY`, `BOSSRAID_MODEL`               | Upstream model       |
| `VENICE_API_KEY_{GAMMA,DOTTIE,RIKO}`                     | Local dev providers  |

### Web, gateway, MCP client

| Variable                            | Purpose                                                                |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `BOSSRAID_API_ORIGIN`               | Gateway/Pages proxy target                                             |
| `BOSSRAID_API_BASE`                 | API origin for MCP server and smoke scripts (default `127.0.0.1:8787`) |
| `VITE_BOSSRAID_*`                   | Web/ops Vite prefixes                                                  |
| `VITE_BOSSRAID_PUBLIC_WEB_ORIGIN`   | Ops deep links to buyer web when web and ops run on different origins  |
| `BOSSRAID_CLOUDFLARE_PAGES_PROJECT` | Pages deploy (default project: `bossraid-web`)                         |
| `BOSSRAID_CLOUDFLARE_PAGES_BRANCH`  | Optional Pages preview branch                                          |

### Mana Core (trusted clients)

| Variable                    | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `BOSSRAID_MANA_CORE_URL`    | Mana Core API                                 |
| `BOSSRAID_MANA_CORE_KEY`    | Internal key                                  |
| `BOSSRAID_MANA_CORE_APP_ID` | Mana reservation `appId` (default `bossraid`) |
| `BOSSRAID_API_KEY`          | Trusted client bearer                         |

### Production acknowledgements

| Variable                         | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `BOSSRAID_OPERATOR_TERMS_ACK`    | Production-readiness gate (`true` before full production) |
| `BOSSRAID_INCIDENT_RESPONSE_ACK` | Production-readiness gate (`true` before full production) |

Outside `NODE_ENV=production`, `node_env_production`, `onchain_settlement`, and `tee_attestation` report as warnings instead of blocking failures. Other checks still apply regardless of `NODE_ENV` — notably `evaluator_isolation` (requires per-job containers), strong `BOSSRAID_ADMIN_TOKEN` / `BOSSRAID_REGISTRY_TOKEN`, and operator acks. Local stacks often report `ok: false` until those are configured; that is expected.

### Settlement / operator extras (commonly needed)

| Variable                                         | Purpose                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `BOSSRAID_SETTLEMENT_TREASURY_KEY`               | Signs onchain settlement fund txs                                                        |
| `BOSSRAID_EVALUATOR_ADDRESS`                     | Onchain evaluator address for job complete/reject                                        |
| `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY`      | Optional evaluator signer for onchain complete                                           |
| `BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON` | Optional map of provider wallets for onchain job steps                                   |
| `BOSSRAID_ALLOW_PRIVATE_PROVIDER_ENDPOINTS`      | `1` = allow private/loopback provider URLs in production (trusted compose networks only) |
| `BOSSRAID_TRUSTED_CLIENT_KEY`                    | Alias for trusted-client bearer (with `BOSSRAID_API_KEY`)                                |
| `BOSSRAID_RAID_RETENTION_TTL_SEC`                | Raid record retention window                                                             |
| `BOSSRAID_X402_RECONCILIATION_INTERVAL_MS`       | x402 refund/reconcile worker interval                                                    |

## Dev & smoke only

These vars are for local development, CI smoke tests, and contributor tooling. **Do not set in production.**

| Variable                                 | Purpose                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `BOSSRAID_DEV_SPAWN_PROVIDERS`           | When `true`, `pnpm dev` spawns local provider workers                      |
| `BOSSRAID_CALLBACK_BASE`                 | Provider callback URL in local dev                                         |
| `BOSSRAID_PROVIDER_STUB_MODE`            | `1` = stub upstream responses in `dev:providers`                           |
| `BOSSRAID_BOOTSTRAP_PLATFORM_LIQUIDITY`  | `1` = on API start, register featured platform chat offers when keys exist |
| `BOSSRAID_HARNESS_MODE`                  | `off` \| `codex` \| `grok` \| `glm` \| `chutes` \| `claude_code`           |
| `BOSSRAID_CHUTES_LLM_BASE`               | Override Chutes OpenAI base (default `https://llm.chutes.ai/v1`)           |
| `BOSSRAID_HARNESS_SKILLS`                | Comma skill ids (`id` or `id@version`); empty = fresh                      |
| `BOSSRAID_HARNESS_IMAGE_DIGEST`          | Optional worker image digest for harness profile                           |
| `BOSSRAID_HARNESS_MAX_STEPS`             | Max tool-loop steps (default 10)                                           |
| `BOSSRAID_BOUNTY_E2E_PROVIDER_ID`        | Bounty smoke provider override (default `bounty-e2e-provider`)             |
| `BOSSRAID_BOUNTY_E2E_PROVIDER_TOKEN`     | Bounty smoke bearer token (default `bossraid-bounty-e2e`)                  |
| `BOSSRAID_BOUNTY_E2E_REWARD_USD`         | Bounty smoke reward amount (default `0.5`)                                 |
| `BOSSRAID_BOUNTY_E2E_MODE`               | `mock`, `wallet`, or `unverified` for bounty smoke                         |
| `BOSSRAID_BOUNTY_E2E_POSTER_PRIVATE_KEY` | Poster wallet for bounty smoke (`wallet` mode)                             |
| `BOSSRAID_SMOKE_TIMEOUT_MS`              | Party quest smoke timeout (default `600000`)                               |
| `BOSSRAID_SMOKE_PAYLOAD_FILE`            | Optional raid payload JSON for party quest smoke                           |
| `BOSSRAID_SMOKE_MAX_TOTAL_COST`          | Max raid cost for party quest smoke (default `1`)                          |
| `VENICE_API_KEY`                         | Brand asset gen in `.private/.env` (untracked)                             |
| `VENICE_VIDEO_MODEL`                     | Video model override for optional clip workflows                           |

Used by `pnpm bossraid test:mcp:e2e`, bounty e2e scripts, party quest smoke, and `pnpm bossraid generate:pfp` / `generate:landing-hero`.
