# Discount Inference

Boss Raid has two buyer surfaces over the same verified provider pool:

- **Discount inference** routes one OpenAI-compatible model call to the cheapest eligible seller.
- **Mercenary raids** route one task across one or more specialist agents, synthesize the result, and split payouts across successful contributors.

Both surfaces use the same provider registration, routing proof, privacy metadata, receipt path, and settlement path. Public buyers can use x402/USDC when enabled. Trusted first-party clients such as Alkahest can instead spend the user's shared Mana Core account through Boss Raid reservations, capture, and refunds. Sellers do not hand buyer-visible subscription credentials to Boss Raid users. They expose clean authenticated HTTP endpoints they are allowed to operate commercially.

## Buyer Quickstart

List available models and seller markets:

```bash
curl http://127.0.0.1:8787/v1/models
curl "http://127.0.0.1:8787/v1/markets?model_id=gpt-5.5"
curl "http://127.0.0.1:8787/v1/markets?model_id=gpt-5.5&max_budget_usd=1&privacy_mode=strict&verification_status=verified"
curl "http://127.0.0.1:8787/v1/prices?model_id=gpt-5.5"
```

For public beta buyer auth:

1. `POST /v1/auth/nonce` with `{ "wallet": "0x..." }`.
2. Sign the returned `message` with the wallet.
3. `POST /v1/auth/verify` with `{ "wallet", "message", "signature" }`.
4. `POST /v1/buyer/api-keys` to create a `br_` key with an optional `spendLimitUsd`.

Call the discount inference lane:

```bash
curl http://127.0.0.1:8787/v1/inference/chat/completions \
  -H "authorization: Bearer br_..." \
  -H "content-type: application/json" \
  -d '{
    "model": "gpt-5.5",
    "messages": [
      { "role": "user", "content": "Write a concise status update." }
    ],
    "raid_policy": {
      "allowed_model_providers": ["openai"],
      "privacy_mode": "prefer"
    }
  }'
```

The inference lane forces `max_agents = 1`, defaults `selection_mode` to `cost_first`, and defaults `allowed_model_ids` to the request `model`. If no explicit `raid_policy.max_total_cost` is supplied, Boss Raid uses the cheapest currently registered matching seller rate as the request budget. x402, when enabled, charges `reserved seller budget + BOSSRAID_X402_CHAT_SURCHARGE_USD + platform markup bps` against the USDC settlement path. The route surcharge is not the model price; seller rates remain per-provider `pricing`.
Buyer API keys are subject to spend caps, max request budget, and per-key request
rate limits before paid execution starts.

Alkahest's Boss Raid lane uses the same route with trusted server headers. It passes the resolved
`manaAccountId`, and Boss Raid reserves through Mana Core before provider execution. Boss Raid captures
server-measured successful token usage and refunds failures. Alkahest calls are forced to a strict Gemma policy:

- `privacy_mode: "strict"`
- `require_privacy_features: ["tee_attested", "e2ee", "signed_outputs", "no_data_retention"]`
- `verification_status: "verified"`
- `require_erc8004: true`
- minimum trust score of `80`
- `allowed_model_providers: ["google"]`
- one selected seller and cost-first routing

No eligible seller means no answer. The Alkahest lane never relaxes to non-TEE, non-E2EE, unverified, stale, over-budget, or context-overflow sellers.

Use the Mercenary orchestration lane when you want multiple agents, synthesis, evaluation, or task artifacts:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model": "mercenary-v1",
    "messages": [
      { "role": "user", "content": "Audit this migration plan and produce risks." }
    ],
    "raid_policy": {
      "max_agents": 3,
      "max_total_cost": 6,
      "privacy_mode": "strict",
      "require_privacy_features": ["tee_attested", "signed_outputs"]
    }
  }'
```

## Seller Quickstart

Sellers register a clean endpoint. The endpoint should implement the Boss Raid provider HTTP interface and authenticate requests with bearer or HMAC auth.

Public beta seller onboarding uses wallet-authenticated routes:

```bash
curl -X POST http://127.0.0.1:8787/v1/seller/providers \
  -H "cookie: bossraid_session=..." \
  -H "content-type: application/json" \
  -d '{
    "name": "Codex GPT-5.5 Seller",
    "endpoint": "https://seller.example.com/bossraid",
    "agentFramework": "codex",
    "modelProvider": "openai",
    "modelId": "gpt-5.5",
    "pricing": {
      "mode": "token_metered",
      "pricePer1mInputTokensUsd": 0.08,
      "pricePer1mOutputTokensUsd": 0.16,
      "minimumChargeUsd": 0.01,
      "currency": "USD",
      "rateCardVersion": "gemma-discount-v1",
      "upstreamModelId": "google/gemma-4-31b-it",
      "maxContextTokens": 131072
    },
    "payoutWallet": "0xSellerWallet",
    "outputTypes": ["text", "json"],
    "privacy": {
      "teeAttested": true,
      "e2ee": true,
      "signedOutputs": true,
      "noDataRetention": true
    },
    "auth": { "type": "bearer", "token": "seller-ingress-token" }
  }'
```

The self-serve route links the provider to the wallet session and immediately runs the same automated verification probe used by ops. Registry-token onboarding remains available for bootstrap and internal operations:

```bash
curl http://127.0.0.1:8787/agents/register \
  -H "authorization: Bearer $BOSSRAID_REGISTRY_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "agentId": "seller-codex-gpt55",
    "name": "Codex GPT-5.5 Seller",
    "endpoint": "https://seller.example.com/bossraid",
    "capabilities": ["analysis", "text"],
    "supportedLanguages": ["text"],
    "supportedFrameworks": ["node"],
    "outputTypes": ["text", "json"],
    "agentFramework": "codex",
    "modelProvider": "openai",
    "modelId": "gpt-5.5",
    "pricing": {
      "mode": "task",
      "pricePerTaskUsd": 0.25,
      "currency": "USD"
    },
    "verification": {
      "status": "pending"
    },
    "privacy": {
      "teeAttested": true,
      "signedOutputs": true,
      "noDataRetention": true
    },
    "auth": {
      "type": "bearer",
      "token": "seller-ingress-token"
    }
  }'
```

Boss Raid stores provider metadata separately:

- `verification` covers endpoint/API/framework/model checks.
- `privacy` covers Phala/TEE, signed output, and retention claims.
- `erc8004` covers registry identity.
- `trust` covers external trust scores.
- `reputation` covers observed performance.

Those fields are intentionally not merged. A seller can be cheap without being verified, verified without being private, or private without having strong historical reputation. Buyers can filter for the combination they need.

After registration, run the automated verification probe:

```bash
curl -X POST http://127.0.0.1:8787/agents/seller-codex-gpt55/verify \
  -H "authorization: Bearer $BOSSRAID_REGISTRY_TOKEN"
```

The probe calls the seller health endpoint, checks that it is reachable and ready, compares declared `agentFramework`, `modelProvider`, and `modelId` metadata against health output, then writes the result to `verification`. Health output can include `agentFramework` / `agent_framework`, `modelProvider` / `model_provider`, and `model`.

## Marketplace Transparency

`GET /v1/markets` returns model order books grouped by `modelId`, sorted by cheapest active seller rate. Each seller entry exposes seller id, display name, model provider, agent framework, declared pricing, status, verification status, privacy badges, output types, and concurrency.

Token-metered sellers expose `pricePer1mInputTokensUsd`, `pricePer1mOutputTokensUsd`, `minimumChargeUsd`, `rateCardVersion`, `rateCardHash`, optional upstream model id, and max context tokens. Flat-task sellers expose `pricePerTaskUsd`. Both can coexist in Boss Raid; callers decide the policy they need.

`GET /v1/models` returns an OpenAI-style model list with Boss Raid marketplace metadata. `GET /v1/prices` returns a compact pricing view for buyers and agents that only need rates.

Marketplace filters are `model_id`, `model_provider`, `agent_framework`, `max_budget_usd`, `privacy_mode=strict`, and `verification_status`. Markets expose cheapest rate, active sellers, verified sellers, private sellers, recent success rate, and p50/p95 latency for buyer-side transparency.

Pricing is provider-declared in this pass. Boss Raid includes a static benchmark reference to `https://models.dev/api.json` for docs, copy, and future benchmark jobs, but routing does not fetch models.dev at runtime.

## Routing

Discount inference routing order:

1. Apply model id, model provider, framework, output, budget, reputation, trust, and privacy filters.
2. Require live/fresh eligible providers through the existing provider routing rules.
3. Estimate server-side prompt/output tokens and sort remaining sellers by effective token-metered charge or flat task rate.
4. Select one seller plus prequoted reserves when available.
5. Store an immutable quote snapshot with selected/reserve seller ids, rate card, endpoint hash, privacy and verification state, attestation summary, max tokens, max charge, mana quote, and expiry.
6. Return an OpenAI-compatible response with Boss Raid receipt metadata.

Mercenary raid routing keeps the existing multi-agent behavior. `selection_mode = "round_robin"` rotates across equally eligible verified providers. `selection_mode = "cost_first"` sorts by declared provider rate.

## Settlement

Single-provider discount inference pays the selected successful provider from the immutable quote snapshot, bounded by the request budget. Multi-agent raids keep Boss Raid’s rule: successful providers split payout equally. Do not reintroduce winner or runner-up payout logic.

USDC/x402 remains the buyer-facing payment path when enabled. On-chain settlement still depends on the configured Boss Raid settlement contracts, wallets, and RPC environment.

For trusted Alkahest traffic, user spend is Mana Core pay-as-you-go. Boss Raid reserves before execution, captures from measured prompt/output tokens after a successful answer, and refunds provider failures. If the user received a successful answer but provider payout later fails, user capture remains valid and provider payout becomes an operator reconciliation issue visible in receipts.

Anti-scam rules are enforced at the marketplace boundary:

- rate changes only affect future quotes; settlement never reads a changed live rate card
- current privacy and attestation state must still match the quote before execution
- provider-reported usage is advisory; Boss Raid bills from server-measured token counts
- fallback can use only a prequoted reserve seller within the original max charge
- streaming and non-streaming capture is capped by reserved output tokens
- provider refusal after a cheap quote produces no payout, reputation penalty, reservation release, and optional cooldown

## Secret Storage

Set `BOSSRAID_SECRET_ENCRYPTION_KEY` before running public beta with file or SQLite persistence.
Boss Raid encrypts provider bearer tokens, provider HMAC secrets, public session tokens, auth
nonces, and buyer API key hashes before writing state. Runtime code decrypts those values in memory
for provider auth and API-key authorization. Without that key, local development remains compatible,
but `/ready` reports `gates.secretsEncrypted = false` for non-memory storage. During key rotation,
set the old key in `BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS` and the new key in
`BOSSRAID_SECRET_ENCRYPTION_KEY`; new state writes use the current key.

## Trust Boundary

Boss Raid should be described as a verified endpoint marketplace, not account resale:

- Sellers run their own endpoints and are responsible for lawful, provider-compliant upstream access.
- Buyers never receive seller subscription credentials.
- Privacy-sensitive calls can require TEE/privacy metadata and attested output paths.
- Receipts, routing proof, and agent logs show who was selected, why, and what settlement rule applied.

Surplus-style cheap inference is the simple lane. Boss Raid’s differentiated lane is verified agent execution with private routing, workstream synthesis, receipts, and settlement proof.
