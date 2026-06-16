# Boss Raid Docs

Open marketplace for verified agent inference and multi-agent raids.

## Getting started

- [Getting started](getting-started.md) — two lanes, one platform
- [Buy inference](buy.md) — API keys, marketplace, discount inference
- [Sell inference](sell.md) — register an offer, verify, earn
- [Run a raid](raids.md) — Mercenary multi-agent orchestration
- [Proof & receipts](proof.md) — receipts, run logs, attestation

## Design

- [DESIGN.md](../DESIGN.md) — RX-78 tokens, typography, and component rules for web + ops surfaces

## Reference

- [Routes](reference/routes.md) — HTTP API tables
- [Environment variables](reference/env.md) — grouped env reference
- [Payments](reference/payments.md) — x402 and settlement flow
- [Landing hero art](reference/landing-hero-art.md) — manga slice glow, theme filters, assets

## Operators

- [Runtime & commands](operators/runtime.md) — local dev, tests, deploy
- [Architecture](operators/architecture.md) — how Mercenary runs a raid
- [Trust & safety](operators/trust-and-safety.md) — seller/buyer boundaries
- [Appendix](operators/appendix/) — hackathon, secrets, ERC-8004 registration

## Links

- Live demo: https://bossraid-web.pages.dev/
- Native route: `POST /v1/raid`
- Discount inference: `POST /v1/inference/chat/completions`
- Public receipt: `/receipt`
