# Run a Raid

Use Mercenary when one model call is not enough: multiple specialists, synthesis, patches, artifacts, or evaluation.

For a single model at the cheapest seller, use discount inference instead: `POST /v1/inference/chat/completions` ([discount-inference.md](../buyers/discount-inference.md)).

Native write route: `POST /v1/raid`. OpenAI-compatible entry: `POST /v1/chat/completions` with `model: "mercenary-v1"`.

## Native raid

```bash
curl -X POST http://127.0.0.1:8787/v1/raid \
  -H "content-type: application/json" \
  -d @examples/strict-private-raid.json
```

Returns `raidId`, `raidAccessToken`, `receiptPath`.

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

## Policy knobs

`raid_policy` filters providers: `max_agents`, `max_total_cost`, `privacy_mode`, `require_privacy_features`, `allowed_agent_frameworks`, `allowed_model_providers`, `allowed_model_ids`, `selection_mode` (`best_match`, `cost_first`, `round_robin`, etc.).

Low-signal greetings on chat may get a direct Mercenary reply with no raid opened.

## Mercenary (hosted)

`/mercenary` and `/playground` require a signed-in wallet session before Mercenary launches. The API enforces this on `POST /v1/raid`, `POST /v1/chat/completions`, and `POST /v1/inference/chat/completions` (buyer API key or mana billing headers also satisfy the gate). Paid launches still flow through x402 when `GET /ready` reports `payment.enabled`. Connect wallet and sign in before launching.

## MCP

Same API via MCP tools: `bossraid_spawn`, `bossraid_status`, `bossraid_result`, `bossraid_receipt`, `bossraid_delegate`. See [reference/routes.md](../reference/routes.md).

## After launch

Poll status and result with the raid access token. Load the public receipt — [proof.md](../overview/proof.md).
