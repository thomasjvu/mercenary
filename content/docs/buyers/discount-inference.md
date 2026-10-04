# Discount inference

Boss Raid's **discount inference** lane is the single-model marketplace path: one OpenAI-compatible call routed to the cheapest eligible seller. This route includes prepaid balance, API-key billing, purchase history, seller earnings, and `savings_usd` metadata.

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

| Field                 | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `selected_seller`     | Provider id that served the call                                  |
| `paid_price_usd`      | Charged amount                                                    |
| `benchmark_price_usd` | Catalog reference price using reported token usage when available |
| `savings_usd`         | `benchmark_price_usd − paid_price_usd` when positive              |
| `rate_card_hash`      | Immutable quote snapshot used for settlement                      |
| `receipt_path`        | Link to verification receipt                                      |
| `routing_proof`       | Privacy and verification gates applied                            |

Purchase history: `GET /v1/buyer/purchases`. Account UI: `/account`.

## Seller loop

Two registration paths feed the same order book:

### HTTP seller

Register your own endpoint with `POST /v1/seller/providers`. Implement the provider HTTP contract (health, accept, heartbeat, submit, failure). Set task or token-metered pricing.

### Hosted upstream seller

Connect an upstream API key and publish catalog offers — no separate worker process:

1. `POST /v1/seller/upstream/:provider/connect` (`openai`, `anthropic`, `zai`, `xai`, `venice`, `redpill`, `near`, `chutes`, `phala`, `darkbloom`, `nebius`)
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

The generated catalog imports [models.dev metadata](https://models.dev/models.json), [provider pricing](https://models.dev/api.json), and public provider feeds at build time. Boss Raid overrides preserve public model IDs and reviewed privacy claims. Models with unknown prices or unsupported output types cannot be published.

```bash
pnpm bossraid sync:inference-catalog
```

Discovery exposes `catalog_source` and `token_pricing` under the model's `bossraid` metadata. `/v1/prices` includes `catalogSource` and `tokenPricing`. Rates can include context thresholds, cached input, and reasoning tokens. `catalog_only` means there is no active seller for that model; it is not a claim that the account can serve it.

## Platform seats

Platform bootstrap considers every priced, supported chat model for all 11 configured providers. Each model must appear in that key's live model list and pass a completion probe plus any required attestation. Operators configure keys and run `POST /v1/ops/platform-liquidity/bootstrap` or enable startup bootstrap.

| Provider  | Platform key                 | Public model ID                                      |
| --------- | ---------------------------- | ---------------------------------------------------- |
| Venice    | `BOSSRAID_VENICE_API_KEY`    | Existing Venice ID                                   |
| Redpill   | `BOSSRAID_REDPILL_API_KEY`   | `redpill/<upstream-id>`                              |
| NEAR AI   | `BOSSRAID_NEAR_API_KEY`      | `near/<upstream-id>`                                 |
| Chutes    | `BOSSRAID_CHUTES_API_KEY`    | `chutes/<upstream-id>`; existing aliases retained    |
| Phala     | `BOSSRAID_PHALA_API_KEY`     | `phala/<upstream-id>`                                |
| Darkbloom | `BOSSRAID_DARKBLOOM_API_KEY` | `darkbloom/<upstream-id>`                            |
| Nebius    | `BOSSRAID_NEBIUS_API_KEY`    | `nebius/<upstream-id>`                               |
| OpenAI    | `BOSSRAID_OPENAI_API_KEY`    | `openai/<upstream-id>`                               |
| xAI       | `BOSSRAID_XAI_API_KEY`       | Existing Grok ID                                     |
| Z.ai      | `BOSSRAID_ZAI_API_KEY`       | Existing GLM ID                                      |
| Anthropic | `BOSSRAID_ANTHROPIC_API_KEY` | `anthropic/<upstream-id>`; existing aliases retained |

Use `GET /v1/models` or `GET /v1/markets?model_provider=nebius` for the deployed catalog and live seller counts. No fixed shortlist needs editing when a supported provider adds a model. Build-time catalog updates require deployment; account availability is refreshed when listing or publishing offers and during bootstrap. See [runtime](../operators/runtime.md#catalog-refresh) for offline snapshots and drift checks.

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

Boss Raid embeds options in the raid task. Compatible adapters forward chat options; OpenAI maps them to Responses fields and gates temperature/reasoning on model capabilities. Anthropic maps messages, system text, and the output limit to Messages; `reasoning_effort` is not forwarded to Anthropic. Individual models may reject unsupported reasoning levels.

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

Repeat the `[model."bossraid-…"]` block for each model id returned by discovery (quote table keys that contain dots). Set `[models] default = "bossraid-grok-4.5"`. Use a buyer `br_…` key for production traffic; admin bearer is for operator dogfood only.

## Related docs

- [Buy inference](buy.md) — buyer setup and curl examples
- [Sell inference](../sellers/sell.md) — seller registration and pricing
- [operators/architecture.md](../operators/architecture.md) — runtime flow and hosted gateway
- [reference/payments.md](../reference/payments.md) — x402, API-key billing, settlement floors
- [Run a raid](../raiders/raids.md) — Mercenary multi-agent lane (including strict-private raids)
