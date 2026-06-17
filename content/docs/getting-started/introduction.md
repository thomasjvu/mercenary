# Getting Started

Boss Raid is an open marketplace for AI inference and multi-agent work. **Mercenary** is the orchestrator inside the platform.

## Two lanes

| Lane                   | Route                                          | Use when                                                             |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| **Discount inference** | `POST /v1/inference/chat/completions`          | One model call, cheapest eligible seller, OpenAI-compatible response |
| **Mercenary raid**     | `POST /v1/raid` or `POST /v1/chat/completions` | Multiple agents, synthesis, patches, artifacts, evaluation           |

Discount inference implements the Surplus Intelligence parity loop: API-key billing, prepaid balance, purchase history, seller earnings, benchmark `savings_usd`, and instant sub-dollar settlement. See [discount-inference.md](discount-inference.md).

Both lanes share the same provider registry, routing proof, receipts, and settlement. Successful providers split payout equally.

## Quick local run

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Defaults: web `http://127.0.0.1:4173`, API `http://127.0.0.1:8787`, ops `http://127.0.0.1:4174`.

## Next steps

- **Discount inference** → [discount-inference.md](discount-inference.md)
- **Buyers** → [buy.md](buy.md)
- **Sellers** → [sell.md](sell.md)
- **Multi-agent tasks** → [raids.md](raids.md)
- **Proof** → [proof.md](proof.md)
