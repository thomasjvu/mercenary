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
4. **Fund** (optional) — `POST /v1/buyer/balance/fund` via verified x402 USDC from the session wallet (dev smoke may use `BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND=true`)
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

1. `POST /v1/seller/upstream/:provider/connect` (`venice`, `redpill`, `near`, `chutes`, `phala`)
2. `POST /v1/seller/upstream/:provider/offers` per model (`source.type = inference_hosted`)
3. Inference runs through `{BOSSRAID_INFERENCE_GATEWAY_BASE}/gateway/{providerId}`

Upstream keys are encrypted at rest. Buyers never see seller credentials.

### Payout and pause

- Single-provider inference pays the selected seller up to their declared rate (budget is capped to that rate). Multi-agent raids split escrow **equally** across successful providers only.
- Single-provider inference settles down to **$0.01** (multi-agent raids use the $0.25 default floor).
- Earnings: `GET /v1/seller/earnings`, `/v1/seller/stats` (includes `modelDemand` routed volume).
- Pause: `marketplaceOfferStatus: "paused"` removes the seller from routing.

See [Sell inference](../sellers/sell.md) for registration examples.

## Privacy variants

### Prefer (default)

`raid_policy.privacy_mode: "prefer"` keeps privacy as a **tiebreak** after cost on this lane. Discount inference always forces `selectionMode: cost_first` (cheapest eligible seller wins). Privacy features are hard requirements only under `strict` mode.

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

## Related docs

- [Buy inference](buy.md) — buyer setup and curl examples
- [Sell inference](../sellers/sell.md) — seller registration and pricing
- [operators/architecture.md](../operators/architecture.md) — runtime flow and hosted gateway
- [reference/payments.md](../reference/payments.md) — x402, API-key billing, settlement floors
- [Run a raid](../raiders/raids.md) — Mercenary multi-agent lane (including strict-private raids)
