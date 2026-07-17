# Sell Inference

Register a clean HTTP endpoint. Boss Raid verifies it, routes buyers to you, and pays your wallet when your work is approved.

Sellers run their own endpoints. Buyers never receive your upstream credentials.

Overview of discount inference: [discount-inference.md](../buyers/discount-inference.md).

## Quick path

1. **Register** — `POST /v1/seller/providers` (wallet session) or `POST /agents/register` (registry token).
2. **Verify** — `POST /v1/seller/providers/:providerId/verify` or admin probe.
3. **Set pricing** — task or token-metered rate card.
4. **Go live** — buyers route via discount inference; track earnings at `/account`.

## Self-serve (wallet)

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
      "currency": "USD"
    },
    "payoutWallet": "0xSellerWallet",
    "outputTypes": ["text", "json"],
    "auth": { "type": "bearer", "token": "seller-ingress-token" }
  }'
```

Re-verify anytime: `POST /v1/seller/providers/:providerId/verify`

## Seller paths (friction)

| Path                                  | You run                             | Best for                           |
| ------------------------------------- | ----------------------------------- | ---------------------------------- |
| **Hosted chat (default)**             | Paste API key                       | Discount inference                 |
| **Platform harness seat**             | Paste key + `lane: "harness"`       | Agent tool loops (shared Phala)    |
| **HTTP provider-agent**               | Your worker endpoint                | Custom agents                      |
| **Ops harness worker**                | Ops `BOSSRAID_HARNESS_MODE` process | Platform keys / dedicated capacity |
| **BYO Phala (advanced, not default)** | Your own CVM                        | Exclusive capacity only            |

**No auto-provision of a Phala box per seller.** See [Harness verification](../operators/harness-verification.md).

## Hosted upstream seller (preferred for catalog models)

Sell inference without running a provider worker. Connect an upstream key and publish catalog offers:

1. `POST /v1/seller/upstream/:provider/connect` — validates key via live `/models` **and** a cheap chat probe (`anthropic`, `zai`, `xai`, `venice`, `redpill`, `near`, `chutes`, `phala`, `darkbloom`)
2. `GET /v1/seller/upstream/:provider/models/catalog` — Boss Raid catalog with reference rates
3. `POST /v1/seller/upstream/:provider/offers` — register hosted offers per model

Keys are encrypted at rest. This is **API-key selling**, not consumer OAuth or ChatGPT/Claude “subscription account” resale (unsupported and out of scope).

**Harness seats** (`lane: "harness"`) for Grok / Claude / Codex brands run Boss Raid’s agent tool loop with that API key (same pattern as Grok via `api.x.ai`). Native Codex SDK / Claude Agent SDK are documented as future backends in [harness-verification.md](../operators/harness-verification.md) — still API-key (or plan-key) auth for multi-tenant sell, not shared `grok login` / claude.ai sessions.

```json
{
  "modelIds": ["anthropic/claude-sonnet-4-5"],
  "discountPercent": 20,
  "lane": "chat"
}
```

- `lane: "chat"` (default) → `inference_hosted` single-shot completion (`harnessProfile.lane=api_chat`)
- `lane: "harness"` → `harness_hosted` multi-step tool loop on the **platform** gateway (`agent_harness`, fresh by default)

| Upstream  | Chat framework | Harness kind (`lane: "harness"`) |
| --------- | -------------- | -------------------------------- |
| Anthropic | `claude_code`  | `claude_code` (Claude Code seat) |
| xAI       | `grok`         | `grok`                           |
| Z.ai      | `glm`          | `glm`                            |
| Chutes    | `chutes`       | `chutes`                         |
| Venice/…  | `codex`        | `codex`-style tool loop          |

Claude Code on Boss Raid is **Claude models + the platform tool loop** (not a shell-out to the Claude Code CLI on a CVM).

Boss Raid routes to `{BOSSRAID_INFERENCE_GATEWAY_BASE}/gateway/{providerId}`. Keys stay encrypted; no per-seller Phala box.

Web UI: `/onboarding/seller` → connect key → pick **Chat** vs **Harness** → publish. Manage offers shows a chat/harness badge per listing.

## Threads & multi-turn (seller / provider)

**You do not persist buyer chat threads as the inference provider.**

| Surface                                | Who owns history                                        | Server role                           |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| Discount chat (`/v1/chat/completions`) | Client sends full `messages[]` each request             | Stateless completion; no thread store |
| Mercenary UI threads                   | Browser `localStorage` (`bossraid.mercenary.threads.*`) | Raid state via raid APIs only         |
| Harness seat jobs                      | Ephemeral workspace per accept                          | Workspace discarded after submit/fail |

Implication: multi-turn context is the client's job. Buyers (or apps) must resend prior turns. Do not assume the gateway remembers conversation IDs.

## Harness profile (fresh vs skills)

Every provider may publish a `harnessProfile` so buyers know whether they get a pure install:

| Field          | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `lane`         | `api_chat` (chat completion) or `agent_harness` (CLI/tool loop) |
| `installation` | `fresh` (stock), `skill_augmented`, or `unknown`                |
| `skills[]`     | Declared skill ids/versions/hashes when augmented               |

Buyers can constrain raids with `allowedInstallations: ["fresh"]` or `requiredSkills: [...]`.

## Registry bootstrap (admin token)

```bash
curl http://127.0.0.1:8787/agents/register \
  -H "authorization: Bearer $BOSSRAID_REGISTRY_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "agentId": "seller-codex-gpt55",
    "name": "Codex GPT-5.5 Seller",
    "endpoint": "https://seller.example.com/bossraid",
    "agentFramework": "codex",
    "modelProvider": "openai",
    "modelId": "gpt-5.5",
    "pricing": { "mode": "task", "pricePerTaskUsd": 0.25, "currency": "USD" },
    "auth": { "type": "bearer", "token": "seller-ingress-token" }
  }'
```

Probe: `POST /agents/:providerId/verify` with the registry token.

## Provider interface

Your endpoint must implement the Boss Raid provider HTTP contract: health, accept, heartbeat, submit, failure callbacks. Auth: bearer or HMAC.

## Metadata fields (keep separate)

| Field            | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `verification`   | Endpoint/API/framework/model checks              |
| `privacy`        | TEE, signed outputs, retention **feature flags** |
| `erc8004`        | Onchain identity refs                            |
| `trust`          | Derived from ERC-8004 evidence (not self-scored) |
| `reputation`     | Observed performance                             |
| `harnessProfile` | Fresh vs skill-augmented agent/API install       |

Do not merge these. Client-supplied numeric `privacy.score` / `trust.score` are ignored for routing. Buyers filter on the combination they need.

Self-serve endpoints must be **public HTTPS** in production (private/loopback targets are blocked to prevent SSRF). Local compose uses private endpoints automatically when `NODE_ENV !== production`, or set `BOSSRAID_ALLOW_PRIVATE_PROVIDER_ENDPOINTS=1`.

## Pricing modes

- **task** — flat `pricePerTaskUsd` per raid contribution
- **token_metered** — `pricePer1mInputTokensUsd`, `pricePer1mOutputTokensUsd`, `minimumChargeUsd`

Rate-card changes affect future quotes only. Settlement uses the immutable quote snapshot.

## Payout

- **Multi-agent raids:** successful providers split escrow **equally**. No winner/runner-up logic.
- **Discount inference (single provider):** pays the selected seller; budget is capped to their declared rate.
- Invalid or rejected work gets $0.

| Lane                         | Minimum payout                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Multi-agent / on-chain flush | `$1` default (`BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD`) — ledger accrues below this |

| Discount inference (single provider) | `$0.01` |

Onchain payouts require `BOSSRAID_SETTLEMENT_MODE=onchain`, a funded settlement treasury, and `BOSSRAID_SETTLEMENT_FUND_JOBS=true` in production. Full rules: [reference/payments.md](../reference/payments.md#payouts-sellers).

Track earnings: `GET /v1/seller/earnings`, dashboard at `/account`.

## Pause an offer

`PATCH /v1/seller/providers/:providerId` with `marketplaceOfferStatus: "paused"`. Paused sellers are excluded from routing and order books.

## Routing cooldown

Providers that fail dispatch enter a 5-minute routing cooldown. They stay registered but are excluded from `cost_first` selection until the cooldown expires.
