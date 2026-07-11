# Tech Stack

Canonical map of languages, frameworks, and deploy topology. Product behavior: [Architecture](/docs/operators/architecture). Runtime commands: [Runtime & Commands](/docs/operators/runtime).

## Requirements

| Tool       | Version                                      |
| ---------- | -------------------------------------------- |
| Node.js    | **>= 22.13** (`node:sqlite` for persistence) |
| pnpm       | 11.8 (see root `packageManager`)             |
| TypeScript | 5.9                                          |

CI and the production Docker image use Node 22.

## Monorepo

pnpm workspace + Turborepo. Apps live in `apps/`; shared libraries in `packages/`. Operator and deploy scripts: `pnpm bossraid <command>` (`pnpm bossraid help`).

## Production topology

Phala CVM runs a compose stack. The gateway serves static web + ops and proxies API traffic.

```text
gateway (serve-gateway.mjs)
  ├── web (static React bundle)
  ├── ops (static React bundle)
  └── api (Fastify)
        ├── @bossraid/orchestrator (in-process library)
        ├── evaluator (Unix socket or HTTP)
        └── provider-agent x3 (HTTP workers)
```

**Orchestrator is not a separate production process.** `apps/api` embeds `@bossraid/orchestrator` via `createDefaultOrchestrator()`. `pnpm bossraid dev:orchestrator` is a dev-only entrypoint.

**Not in the production Docker image:** `mcp-server` (CI integration), `docs` (papers site), `video` (Remotion promo).

## Apps

| App              | Stack                                  | Role                                                          |
| ---------------- | -------------------------------------- | ------------------------------------------------------------- |
| `api`            | Fastify 5, `@fastify/swagger`          | Public HTTP API, x402, proof routes, hosted inference gateway |
| `orchestrator`   | TypeScript library                     | Planning, routing, synthesis, settlement (embedded in API)    |
| `provider-agent` | Fastify 5                              | HTTP provider worker                                          |
| `evaluator`      | Fastify 5, Docker job isolation        | Sandboxed runtime probes                                      |
| `web`            | React 19, Vite 7, SWR                  | Marketplace, Mercenary, receipts                              |
| `ops`            | React 19, Vite 7, SWR                  | Internal control plane                                        |
| `mcp-server`     | `@modelcontextprotocol/sdk`            | MCP adapter for IDE agents                                    |
| `docs`           | React 19, Vite 6, Tailwind 3, Pagefind | Papers documentation site                                     |
| `video`          | Remotion 4                             | Promo renders only                                            |

## Packages (22)

| Group         | Packages                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------- |
| Foundation    | `shared-types`, `constants`, `api-contracts`, `openapi-schemas`                             |
| Raid stack    | `raid-core`, `provider-registry`, `provider-sdk`, `evaluation`, `scoring`, `sandbox-runner` |
| Storage       | `persistence`, `persistence-sqlite`                                                         |
| UI / proof    | `proof-ui` (headless), `ui` (React)                                                         |
| Integrations  | `privacy-engine`, `smart-pay`, `venice-client`, `oneshot-relayer`, `http-client`, `logger`  |
| Deploy / test | `contracts` (Solidity bootstrap), `test-fixtures` (dev/test only)                           |

## Persistence

| Backend | Env                                         | Notes                                             |
| ------- | ------------------------------------------- | ------------------------------------------------- |
| SQLite  | `BOSSRAID_STORAGE_BACKEND=sqlite` (default) | `node:sqlite` `DatabaseSync` — not better-sqlite3 |
| Memory  | `memory`                                    | Ephemeral; tests and dev only                     |

`BOSSRAID_STORAGE_BACKEND=file` was removed. Detail: [Data Storage](data-storage.md).

## Payments & onchain

| Layer          | Technology                                                        |
| -------------- | ----------------------------------------------------------------- |
| x402           | `@x402/core`, `@x402/evm`, `@x402/fetch`, `@payai/facilitator`    |
| Smart accounts | `@metamask/smart-accounts-kit`, `@metamask/x402` via `smart-pay`  |
| EVM            | viem 2.x                                                          |
| Contracts      | Solidity 0.8.30 (`solc`) in `packages/contracts`; ERC-8183 escrow |
| Identity       | ERC-8004 via Virtuals ACP                                         |

## Privacy, evaluation, proof

- **privacy-engine** — strict-private gating, upstream TEE verification
- **evaluation + scoring + sandbox-runner** — evaluator probes and rubric scoring
- **proof-ui** — headless receipt/routing/attestation helpers for web, ops, MCP
- **TEE** — Phala CVM + dstack socket (`BOSSRAID_TEE_SOCKET_PATH`); EigenCompute optional for judging lanes

## Hosted inference upstreams

Venice, Redpill, NEAR, Chutes, Phala — routed through the API-hosted inference gateway. See [Architecture](/docs/operators/architecture#hosted-venice-sellers).

## Deploy targets

| Target           | Use                                                                       |
| ---------------- | ------------------------------------------------------------------------- |
| Phala CVM        | Primary production (`deploy/phala/docker-compose.yml`, Infisical secrets) |
| Cloudflare Pages | Static web (`bossraid-web.pages.dev`) and docs                            |
| Docker           | Single image: api, evaluator, provider-agent, web, ops (`Dockerfile`)     |

## Dev-only mocks (blocked in production)

These env toggles exist for local rehearsal and CI. `GET /v1/ops/production-readiness` fails when any are enabled in production:

- `BOSSRAID_PROVIDER_STUB_MODE` — stub provider upstream responses
- `BOSSRAID_VENICE_MOCK`, `BOSSRAID_UPSTREAM_MOCK`, `BOSSRAID_UPSTREAM_TEE_MOCK` — mock upstream inference and TEE
- `BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND`, `BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND` — bypass verified x402 settlement

Full env tables: [reference/env](/docs/reference/env).

## Related

- [Local Development](local-development.md)
- [Data Storage](data-storage.md)
- [Architecture](/docs/operators/architecture)
- [Runtime & Commands](/docs/operators/runtime)
