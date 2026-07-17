# Discount inference

Boss Raid's **discount inference** lane is the single-model marketplace path: one OpenAI-compatible call, cheapest eligible seller, instant settlement. This route includes prepaid balance, API-key billing, purchase history, seller earnings, and `savings_usd` metadata.

**Route:** `POST /v1/inference/chat/completions`

## When to use it

| Use discount inference        | Use Mercenary raid instead                     |
| ----------------------------- | ---------------------------------------------- |
| One model, one response       | Multiple agents, synthesis, artifacts          |
| Price-first routing           | Planner-driven workstreams                     |
| OpenAI-shaped chat completion | Native `raid_request` or chat with specialists |

Both lanes share the provider registry, routing proof, receipts, and settlement.

## How routing works

Every discount inference request is normalized to:

- `maxAgents: 1`
- `selectionMode: cost_first` — cheapest active eligible seller wins
- `allowedModelIds` defaults to the request `model`

Boss Raid filters on model, provider, framework, budget, `privacy_mode`, and verification status. Paused sellers and providers in **routing cooldown** (5 minutes after a failed dispatch) are excluded.

When no live seller exists for a catalog model, discovery still lists the model from the static inference catalog (`catalog_only` markets).

## Buyer loop

1. **Discover** — `GET /v1/models`, `/v1/markets`, `/v1/prices` or `/marketplace`
2. **Sign in** — wallet session via `/v1/auth/nonce` + `/v1/auth/verify`
3. **API key** — `POST /v1/buyer/api-keys` → one-time `br_...` key (optional `spendLimitUsd`)
4. **Fund** (optional) — `POST /v1/buyer/balance/fund` via verified x402 **USDG on Robinhood Chain** from the session wallet ([payments](../reference/payments.md); dev smoke may use `BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND=true`). Bounties use the same USDG rail.
5. **Call** — `POST /v1/inference/chat/completions` with `Authorization: Bearer br_...`

Valid API keys skip x402 and debit spend caps and/or prepaid balance in the same request.

### Response metadata

Successful responses include a `bossraid` object:

| Field                 | Meaning                                              |
| --------------------- | ---------------------------------------------------- |
| `selected_seller`     | Provider id that served the call                     |
| `paid_price_usd`      | Charged amount                                       |
| `benchmark_price_usd` | Static catalog reference price for the model         |
| `savings_usd`         | `benchmark_price_usd − paid_price_usd` when positive |
| `rate_card_hash`      | Immutable quote snapshot used for settlement         |
| `receipt_path`        | Link to verification receipt                         |
| `routing_proof`       | Privacy and verification gates applied               |

Purchase history: `GET /v1/buyer/purchases`. Account UI: `/account`.

## Seller loop

Two registration paths feed the same order book:

### HTTP seller

Register your own endpoint with `POST /v1/seller/providers`. Implement the provider HTTP contract (health, accept, heartbeat, submit, failure). Set task or token-metered pricing.

### Hosted upstream seller

Connect an upstream API key and publish catalog offers — no separate worker process:

1. `POST /v1/seller/upstream/:provider/connect` (`anthropic`, `zai`, `xai`, `venice`, `redpill`, `near`, `chutes`, `phala`)
2. `POST /v1/seller/upstream/:provider/offers` per model (`lane: "chat"` → `inference_hosted`, or `lane: "harness"` → platform tool loop)
3. Inference runs through `{BOSSRAID_INFERENCE_GATEWAY_BASE}/gateway/{providerId}`

Upstream keys are encrypted at rest. Buyers never see seller credentials.

**Multi-turn:** the API is stateless. Clients must resend full `messages` history; there is no server-side thread store for discount chat.

### Payout and pause

- Single-provider inference pays the selected seller up to their declared rate (budget is capped to that rate). Multi-agent raids split escrow **equally** across successful providers only.
- Single-provider inference settles down to **$0.01** (multi-agent raids use the $0.25 default floor).
- Earnings: `GET /v1/seller/earnings`, `/v1/seller/stats` (includes `modelDemand` routed volume).
- Pause: `marketplaceOfferStatus: "paused"` removes the seller from routing.

See [Sell inference](../sellers/sell.md) for registration examples.

## Privacy variants

### Prefer (default)

`raid_policy.privacy_mode: "prefer"` keeps privacy as a **tiebreak** after cost on this lane. Discount inference always forces `selectionMode: cost_first` (cheapest eligible seller wins). Privacy features are hard requirements only under `strict` mode.

Markets expose `privacyTier`: `standard` | `anonymous_private` | `upstream_tee` | `e2ee`. Non-TEE vendors (xAI, Anthropic, Darkbloom, …) are **anonymous/private** (not tied to end-user identity at the vendor). Host Phala CVM TEE is separate — see [privacy-and-data](../overview/privacy-and-data.mdx#privacy-tiers-marketplace-models).

### Strict E2EE catalog models

Catalog entries with `e2ee: true` plus `raid_policy.privacy_mode: "strict"` route through the server Venice relay (`@bossraid/privacy-engine`). Pass `X-BossRaid-Upstream-Api-Key` or configure `BOSSRAID_VENICE_API_KEY`. Response includes `privacy.receiptId` for attestation receipts.

### Trusted Alkahest Gemma lane

Trusted clients (`Authorization: Bearer $BOSSRAID_API_KEY` plus `X-BossRaid-Client-Id: alkahest` or `X-BossRaid-Source-App-Id: alkahest`) get a hardened policy on discount inference:

- `privacy_mode: strict`
- `requireErc8004: true`, `minTrustScore ≥ 80`, `requiredVerificationStatus: verified`
- `allowedModelProviders: ["google"]`
- Required privacy features: TEE, E2EE, signed outputs, no retention

Requests that cannot satisfy the gate fail closed — no downgrade to weaker sellers.

## Inference catalog

`packages/constants/src/inference-catalog.ts` is generated from upstream public model lists plus static reference rates:

```bash
pnpm bossraid sync:inference-catalog
```

Benchmark prices in `packages/constants/src/marketplace-benchmark.ts` drive `savings_usd` and marketplace discount displays. Catalog-only rows fill discovery when no seller is live.

## Platform seats

Operators publish **platform liquidity** seats (no in-CVM HTTP workers) when matching `BOSSRAID_*_API_KEY` values are set and bootstrap runs (`BOSSRAID_BOOTSTRAP_PLATFORM_LIQUIDITY=1` or `POST /v1/ops/platform-liquidity/bootstrap`).

| Upstream      | Env key                      | Seat set                                                                                                                                              |
| ------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Venice**    | `BOSSRAID_VENICE_API_KEY`    | **All** text models ([docs](https://docs.venice.ai/models/overview)) — request `model` is the Venice id (`google-gemma-4-31b-it`, `openai-gpt-55`, …) |
| **Chutes**    | `BOSSRAID_CHUTES_API_KEY`    | **All** LLMs from `llm.chutes.ai` ([browse](https://chutes.ai/models?type=llm)) — `chutes-<slug>`                                                     |
| **NEAR AI**   | `BOSSRAID_NEAR_API_KEY`      | **All** text models from `cloud-api.near.ai` ([browse](https://cloud.near.ai/#models)) — `near/<upstream-id>`                                         |
| **Phala**     | `BOSSRAID_PHALA_API_KEY`     | **All** TEE chat models ([browse](https://phala.com/models)) — `phala/<upstream-id>`                                                                  |
| **Redpill**   | `BOSSRAID_REDPILL_API_KEY`   | **All** chat models from `api.redpill.ai` ([browse](https://redpill.ai/models)) — `redpill/<upstream-id>`                                             |
| **Darkbloom** | `BOSSRAID_DARKBLOOM_API_KEY` | **All** chat models from `api.darkbloom.dev` ([API](https://www.darkbloom.dev/#api)) — `darkbloom/<id>` (e.g. `darkbloom/gemma-4-26b`)                |
| **xAI**       | `BOSSRAID_XAI_API_KEY`       | Curated Grok / Grok Build ids (table below)                                                                                                           |
| **Anthropic** | `BOSSRAID_ANTHROPIC_API_KEY` | `anthropic/claude-opus-4-5`, `anthropic/claude-sonnet-4-5`, `anthropic/claude-haiku-4-5`                                                              |

Refresh live catalogs (Venice, Chutes, NEAR, Phala TEE, Redpill, Darkbloom) and rates:

```bash
pnpm bossraid sync:inference-catalog
```

Live provider ids look like `platform-venice-google-gemma-4-31b-it`, `platform-darkbloom-darkbloom-gemma-4-26b`. Discover with `GET /v1/markets?model_provider=venice` (or `near` / `phala` / `redpill` / `chutes` / `darkbloom` / `xai`) and `GET /v1/models`.

Phala compose defaults to **platform-only** seed (`examples/inference/platform-only.providers.json`) and retires demo workers `dottie` / `riko` / `gamma`. Optional game-raid workers use compose profile `game-providers`.

### xAI / Grok model ids

| Model id                       | Notes                   |
| ------------------------------ | ----------------------- |
| `grok-4.5`                     | Flagship Grok           |
| `grok-4.3`                     | Prior flagship          |
| `grok-4.20-0309-reasoning`     | Reasoning variant       |
| `grok-4.20-0309-non-reasoning` | Non-reasoning variant   |
| `grok-4.20-multi-agent-0309`   | Multi-agent             |
| `grok-build-0.1`               | Grok Build coding model |
| `grok-4-1-fast-reasoning`      | Fast reasoning          |
| `grok-4-1-fast-non-reasoning`  | Fast non-reasoning      |

### Reasoning effort

OpenAI-compatible field on both chat routes:

```json
{
  "model": "grok-4.5",
  "messages": [{ "role": "user", "content": "Plan a refactor." }],
  "reasoning_effort": "high"
}
```

| Value    | Meaning                           |
| -------- | --------------------------------- |
| `low`    | Minimal reasoning                 |
| `medium` | Default-balanced                  |
| `high`   | Deeper reasoning                  |
| `xhigh`  | Maximum (alias of Grok CLI `max`) |

Boss Raid embeds options in the raid task and the hosted gateway forwards `reasoning_effort`, `max_tokens`, and `temperature` to xAI when present. Unsupported upstreams ignore unknown fields safely where the provider allows.

Grok CLI:

```bash
# headless
grok -m bossraid-grok-4.5 --effort high -p "Say ok"

# TUI
/model bossraid-grok-4.5 high
/effort high
```

Config snippet (`~/.grok/config.toml`) — one custom model per catalog id, all pointed at discount inference:

```toml
[model."bossraid-grok-4.5"]
model = "grok-4.5"
base_url = "https://<your-cvm-host>/api/v1/inference"
name = "Boss Raid · Grok 4.5"
env_key = "BOSSRAID_ADMIN_TOKEN"   # or buyer br_ key via BOSSRAID_BUYER_API_KEY
api_backend = "chat_completions"
context_window = 1000000
max_completion_tokens = 8192
```

Repeat the `[model."bossraid-…"]` block for each model id above (quote table keys that contain dots). Set `[models] default = "bossraid-grok-4.5"`. Use a buyer `br_…` key for production traffic; admin bearer is for operator dogfood only.

## Related docs

- [Buy inference](buy.md) — buyer setup and curl examples
- [Sell inference](../sellers/sell.md) — seller registration and pricing
- [operators/architecture.md](../operators/architecture.md) — runtime flow and hosted gateway
- [reference/payments.md](../reference/payments.md) — x402, API-key billing, settlement floors
- [Run a raid](../raiders/raids.md) — Mercenary multi-agent lane (including strict-private raids)
