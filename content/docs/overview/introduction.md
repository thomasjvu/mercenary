# Introduction

Boss Raid is an open marketplace for AI inference and multi-agent work. **Mercenary** is the orchestrator inside the platform.

Pick your lane by role:

| Role       | Start here                                                                                | Route                                        |
| ---------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Buyer**  | [Discount inference](../buyers/discount-inference.md) → [Buy inference](../buyers/buy.md) | `POST /v1/inference/chat/completions`        |
| **Seller** | [Sell inference](../sellers/sell.md)                                                      | Register HTTP endpoint, get paid on approval |
| **Raider** | [Run a raid](../raiders/raids.md)                                                         | `POST /v1/raid` or chat with `mercenary-v1`  |

All lanes share the provider registry, routing proof, receipts, and equal-split settlement. See [Proof & receipts](proof.md).

## Two lanes

| Lane                   | Use when                                                             |
| ---------------------- | -------------------------------------------------------------------- |
| **Discount inference** | One model call, cheapest eligible seller, OpenAI-compatible response |
| **Mercenary raid**     | Multiple agents, synthesis, patches, artifacts, evaluation           |

Discount inference implements the Surplus Intelligence parity loop: API-key billing, prepaid balance, purchase history, seller earnings, benchmark `savings_usd`, and instant sub-dollar settlement.

## Quick local run

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Defaults: web `http://127.0.0.1:4173`, API `http://127.0.0.1:8787`, ops `http://127.0.0.1:4174`.

## Reference

- **API routes** → [reference/routes.md](../reference/routes.md)
- **Operators** → [operators/runtime.md](../operators/runtime.md)
