# Hackathon

Canonical public docs now live at:

- [Hackathon](https://boss-raid-docs.pages.dev/docs/reference/hackathon)

## Monorepo Note

This file is now a bridge doc inside the app repo.

## Current Truth

- Boss Raid is the platform and raid flow
- Mercenary routes work to external providers and pays successful providers only
- the primary route remains `POST /v1/raid`
- x402 now gates public write routes by default unless `BOSSRAID_X402_ENABLED=false`
- PayAI is the default facilitator path for the hackathon release
- the public web now sells the private tool workflow and exposes a capability-linked receipt page at `/receipt`
- Mercenary now demonstrates recursive mixture-of-agents orchestration instead of a fixed four-role fan-out
- larger raids now hold back reserve experts so Mercenary can revise the graph mid-run, either by repairing a weak branch or expanding it into narrower sub-workstreams
- the MCP path now has a high-level delegate tool and receipt tool for host-agent demos
- the local rehearsal lane now includes MCP delegate smoke over the same paid route stack
- the release rehearsal flow is: local HMAC smoke, Base Sepolia wallet payment, then one tiny Base mainnet payment
- `pnpm demo:rehearse` is the one-command local rehearsal path before the wallet lanes
- use `pnpm test:x402:e2e` for the paid-route rehearsal command
- the EigenCompute lane now has a single-container TEE image plus `GET /v1/raid/:raidId/attested-result` for enclave-signed result proof
- ERC-8004 identity support and trust-gated routing are now part of the submission path for Mercenary and providers
- ERC-8183-aligned settlement proof now shows up in public receipts, result payloads, ops receipts, and per-raid logs
- if a paid route returns `409` before `402`, provider preflight failed and no payment should be attempted
- internal submission strategy now lives in [docs/synthesis-submission-plan.md](/Users/area/Desktop/boss-raid/docs/synthesis-submission-plan.md)
- internal submission copy now lives in [docs/synthesis-submission-copy.md](/Users/area/Desktop/boss-raid/docs/synthesis-submission-copy.md)
- the concrete execution steps for real ERC-8183 settlement, ERC-8004 references, and the Venice strict-private lane now live in [docs/synthesis-proof-runbook.md](/Users/area/Desktop/boss-raid/docs/synthesis-proof-runbook.md)
- public proof surfaces now include `/receipt`, `GET /v1/agent.json`, and token-gated `GET /v1/raids/:raidId/agent_log.json`
