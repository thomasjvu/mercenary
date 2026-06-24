# Run a Raid

Use Mercenary when one model call is not enough: multiple specialists, synthesis, patches, artifacts, or evaluation.

For a single model at the cheapest seller, use discount inference: `POST /v1/inference/chat/completions` ([discount-inference.md](../buyers/discount-inference.md)).

## Quick path

1. **Choose an entry** — native `POST /v1/raid` or chat `POST /v1/chat/completions` with `model: "mercenary-v1"`.
2. **Set policy** — `max_agents`, `max_total_cost`, `privacy_mode`, and provider filters in `raid_policy`.
3. **Launch** — response returns `raidId`, `raidAccessToken`, `receiptPath`.
4. **Verify** — poll status/result, then open the receipt ([proof.md](../overview/proof.md)).

## Native raid

```bash
curl -X POST http://127.0.0.1:8787/v1/raid \
  -H "content-type: application/json" \
  -d @examples/raids/strict-private/strict-private-raid.json
```

## Chat-compatible raid

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model": "mercenary-v1",
    "messages": [
      { "role": "user", "content": "Audit this migration plan and list risks." }
    ],
    "raid_policy": {
      "max_agents": 3,
      "max_total_cost": 6,
      "privacy_mode": "strict",
      "require_privacy_features": ["tee_attested", "signed_outputs"]
    }
  }'
```

Response includes chat `choices` and usually a `raid` object with ids and receipt path.

## When to use which lane

| Need                         | Lane                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| Cheapest single model reply  | [Buy inference](../buyers/buy.md) — `POST /v1/inference/chat/completions` |
| Multi-agent synthesis        | This page — `POST /v1/raid` or chat with `mercenary-v1`                   |
| Patches, images, game assets | Native `POST /v1/raid` with task files and `output` types                 |
| IDE agent with tool use      | MCP (below) or `/skill.md`                                                |
| Scripted integration         | `POST /v1/raid` directly                                                  |

## Policy knobs

`raid_policy` filters providers: `max_agents`, `max_total_cost`, `privacy_mode`, `require_privacy_features`, `allowed_agent_frameworks`, `allowed_model_providers`, `allowed_model_ids`, `selection_mode` (`best_match`, `cost_first`, `round_robin`, etc.).

Low-signal greetings on chat may get a direct Mercenary reply with no raid opened.

## Mercenary (hosted)

`/mercenary` and `/playground` require a signed-in wallet session before Mercenary launches. The API enforces this on `POST /v1/raid`, `POST /v1/chat/completions`, and `POST /v1/inference/chat/completions` (buyer API key or mana billing headers also satisfy the gate).

On `/mercenary`, the sidebar run panel shows status, attestation, and payment controls:

- **Wallet credit** (default) — paid launches flow through x402 when `GET /ready` reports `payment.enabled`.
- **API key** — pick a saved `br_...` key to skip x402; debits key spend cap and/or prepaid balance.
- **Key budget** — set per-key spend limit (min $1) via `PATCH /v1/buyer/api-keys/:keyId`.
- **Per raid** — `max_total_cost` for the current message (min $1).

Fees and seller payouts: [reference/payments.md](../reference/payments.md).

Connect wallet and sign in before launching.

## MCP

For IDE agents (Cursor, Claude Desktop, and other MCP clients), use the dedicated [MCP tools guide](mcp.md) — setup, config JSON, tool map, and smoke tests.

## After launch

Poll status and result with the raid access token. Load the public receipt — [proof.md](../overview/proof.md).
