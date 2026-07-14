# Buy Inference

Get a buyer API key. Call the inference route. Boss Raid picks the cheapest eligible seller and returns an OpenAI-shaped response plus receipt metadata.

Architecture and billing details: [discount-inference.md](discount-inference.md).

## Quick path

1. **Discover** — `GET /v1/models`, `/v1/markets`, `/v1/prices`.
2. **Sign in** — wallet nonce + verify, then `POST /v1/buyer/api-keys`.
3. **Call** — `POST /v1/inference/chat/completions` with `Authorization: Bearer br_...`.
4. **Verify** — check `bossraid.receipt_path` or [proof.md](../overview/proof.md).

## Browse the market

```bash
curl http://127.0.0.1:8787/v1/models
curl "http://127.0.0.1:8787/v1/markets?model_id=gpt-5.5"
curl "http://127.0.0.1:8787/v1/prices?model_id=gpt-5.5"
```

Filters: `model_id`, `model_provider`, `agent_framework`, `max_budget_usd`, `privacy_mode`, `verification_status`.

## Create an API key

1. `POST /v1/auth/nonce` with `{ "wallet": "0x..." }`
2. Sign the returned `message` with the wallet
3. `POST /v1/auth/verify` with `{ "wallet", "message", "signature" }`
4. `POST /v1/buyer/api-keys` → returns a one-time `br_...` key (optional `spendLimitUsd`)

Use `Authorization: Bearer br_...` on paid routes. Valid keys skip the x402 challenge and debit spend caps / prepaid balance.

## Call discount inference

```bash
curl http://127.0.0.1:8787/v1/inference/chat/completions \
  -H "authorization: Bearer br_..." \
  -H "content-type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4-5",
    "messages": [
      { "role": "user", "content": "Write a concise status update." }
    ],
    "raid_policy": {
      "allowed_model_providers": ["anthropic"],
      "privacy_mode": "prefer"
    }
  }'
```

Each call is independent: include prior turns in `messages` if you want multi-turn context. Boss Raid does not store chat threads for you.

**Playground first success:** open `/playground`, leave **live offers only** on, paste a `br_...` key (create under Buy onboarding if needed), pick a model with live sellers, run. Empty live markets mean no sellers yet — try another model or [sell](../sellers/sell.md).

Defaults: one seller, `cost_first` routing, `allowed_model_ids` = request `model`. Budget defaults to the cheapest matching seller rate when `max_total_cost` is omitted.

## Response metadata

The `bossraid` field on successful responses includes:

- `selected_seller` — provider that served the call
- `paid_price_usd`, `benchmark_price_usd`, `savings_usd` — charge vs static catalog reference
- `rate_card_hash` — quote snapshot used for settlement
- `receipt_path` — verification link
- `routing_proof` — privacy and verification gates applied

Purchase history: `GET /v1/buyer/purchases`.

## Strict E2EE models

Catalog models marked `e2ee` with `raid_policy.privacy_mode: "strict"` route through the server Venice relay. Pass `X-BossRaid-Upstream-Api-Key` or set `BOSSRAID_VENICE_API_KEY`. No eligible strict seller → fail closed.

## Payment

- **Public buyers**: x402 **USDG on Robinhood Chain** (`eip155:4663`) when enabled (`BOSSRAID_X402_ENABLED=true` or ops toggle) via Marian facilitator
- **Buyer API keys**: spend cap + optional prepaid balance (`GET /v1/buyer/balance`)
- **Balance top-up** (`POST /v1/buyer/balance/fund`): requires verified x402 USDG from a connected wallet in production. No instant credit without payment.

**Fees:** charge = reserved seller rate + route surcharge + ~1% platform markup. API keys skip the x402 challenge but debit the same underlying charge. Full breakdown: [reference/payments.md](../reference/payments.md#fees-buyers).

## Need more than one agent?

Use [Run a raid](../raiders/raids.md) for Mercenary multi-agent orchestration.

## Account UI

- `/marketplace` — browse models and sellers
- `/onboarding/buyer` — wallet sign-in and first request
- `/account` — API keys, usage, balance
