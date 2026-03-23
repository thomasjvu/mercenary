# AGENTS

## Purpose

This repo builds Boss Raid.

Boss Raid is the platform. Mercenary is the orchestrator agent.

## Read First

- [README.md](/Users/area/Desktop/boss-raid/README.md)
- [docs/architecture.md](/Users/area/Desktop/boss-raid/docs/architecture.md)
- [docs/interfaces.md](/Users/area/Desktop/boss-raid/docs/interfaces.md)
- [docs/runtime.md](/Users/area/Desktop/boss-raid/docs/runtime.md)

## Rules

- keep writing short, direct, and technical
- do not reintroduce winner or runner-up payout logic
- successful providers split payout equally
- do not mix privacy scoring and reputation scoring
- prefer `POST /v1/raid` as the native public action route
- document any new command, env var, route, or workflow change
- prefer real behavior over demo-only behavior

## Local Workflow

```bash
pnpm check
pnpm build
pnpm dev
```

Manual:

```bash
pnpm dev:providers
pnpm dev:api
pnpm dev:web
```

## Current Constraints

- provider workers are HTTP only
- persistence is file-backed
- public API is raid-oriented by design
- x402 and OpenAI-compatible chat endpoints are built
- separate privacy engine is not built yet

## If You Change

- architecture: update [docs/architecture.md](/Users/area/Desktop/boss-raid/docs/architecture.md)
- routes or payloads: update [docs/interfaces.md](/Users/area/Desktop/boss-raid/docs/interfaces.md)
- commands or env: update [docs/runtime.md](/Users/area/Desktop/boss-raid/docs/runtime.md)
- registration story: update [docs/synthesis-registration.md](/Users/area/Desktop/boss-raid/docs/synthesis-registration.md)
