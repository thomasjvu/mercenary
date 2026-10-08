# Architecture

Boss Raid is the platform. Mercenary is the orchestrator agent.

Read this page when you need the system map: raids and bounties, how routing and settlement connect, and where attestation fits. Lane walkthroughs live in [introduction.md](../overview/introduction.md).

## Product boundary

Boss Raid owns raids, bounty lifecycle, HTTP agent workers, evaluation, synthesis, work receipts, and settlement. Alkahest owns model inference buying, selling, routing, metering, and seller credentials.

`POST /v1/raid` is the native action. `POST /v1/chat/completions` adapts Mercenary work orchestration to chat. Boss Raid has no standalone inference route, embedded hosted seller gateway, inference catalog discovery API, or upstream seller onboarding.

## Runtime flow

1. Client hits API (raid, Mercenary chat, or MCP).
2. API validates, applies x402 when enabled, persists launch reservation, spawns raid.
3. Mercenary plans workstreams, selects HTTP providers, persists run state.
4. Providers heartbeat, submit outputs, or report failure.
5. Evaluator runs isolated probes when execution is enabled.
6. Mercenary synthesizes one result and settles approved contributors only. Successful providers split payout equally.
7. Receipt, `agent_log.json`, and attestation routes expose proof. Onchain mode can refresh settlement state at read time.
8. On restart, nonterminal raids resume from persisted state.

## Production gate

`GET /v1/ops/production-readiness` must return `ok: true` before production work traffic. The gate checks real onchain settlement on Robinhood mainnet with USDG, funded-job configuration, Phala host attestation and runtime signing, container evaluation, strong secrets, and disabled mocks or verification bypasses.

x402 may remain disabled for a private rehearsal. Enable it for public paid wallet traffic only after the full gate passes. SQLite produces a controlled-launch storage warning; use Postgres for a broader production deployment. An empty worker registry starts for onboarding but cannot provide ready capacity.

Local test/build success does not prove live deployment readiness. See [runtime.md](runtime.md) for the operator checks.

## Apps

- `apps/api` — public API, auth, x402, work proof routes
- `apps/orchestrator` — planning, routing, synthesis, settlement (library embedded in `api`; not a separate production process)
- `apps/provider-agent` — HTTP provider worker
- `apps/evaluator` — sandboxed runtime probes
- `apps/mcp-server` — MCP adapter
- `apps/web` — raids, bounties, worker onboarding, receipt
- `apps/ops` — internal control surface

## Packages

Full stack map: [Tech Stack](/dev-docs/operators/tech-stack) in dev-docs. Core groups: foundation (`shared-types`, `constants`, `api-contracts`, `openapi-schemas`), raid stack (`raid-core`, `provider-registry`, `provider-sdk`, `evaluation`, `scoring`, `sandbox-runner`), storage (`persistence`, `persistence-sqlite`, `persistence-postgres`), UI/proof (`ui`, `proof-ui`), integrations (`privacy-engine`, `smart-pay`, `venice-client`, `oneshot-relayer`, `http-client`, `logger`), deploy/test (`contracts`, `test-fixtures`).

## Attestation & proof

| Surface       | Route                                  | Purpose                                                                                              |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Public host   | `GET /v1/host/attestation`             | Phala TDX quote via dstack (`/var/run/dstack.sock`); optional `signedRuntime` when `MNEMONIC` is set |
| Admin runtime | `GET /v1/attested-runtime`             | Signed runtime envelope for operators                                                                |
| Raid result   | `GET /v1/raid/:raidId/attested-result` | Signed synthesized output                                                                            |
| Web inspector | Sidebar and raid receipt               | Host quote, runtime signing, upstream TEE rows                                                       |

Host attestation exposes separate signals: `teeVerified` (hardware quote) and `runtimeSigned` (MNEMONIC envelope). Top-level `verified` tracks TEE quote validity only.

Strict-private raids re-verify provider privacy attestations server-side (`BOSSRAID_PRIVACY_SERVER_VERIFY`, default on). Provider callbacks alone are not trusted for `featuresVerified`.

Known gaps: attestation telemetry on raid timelines is still partial. `MNEMONIC` is required for Phala production signed envelopes and is listed in the Phala core secrets tier (`deploy/phala/secrets.core.env.example`). See [proof.md](../overview/proof.md).

## Persistence revisions

SQLite and Postgres share revision hashing from `@bossraid/persistence`. Raid hashes exclude `updatedAt`; provider hashes exclude `lastSeenAt`. Timestamp-only changes therefore do not rewrite unchanged records. Other record fields remain part of the hash.

## Constraints

- Providers are HTTP only.
- `POST /v1/raid` is the native public action route.
- x402 is opt-in (ops toggle).
- ERC-8004 identity via Virtuals ACP; Boss Raid consumes and optionally verifies refs.
- ERC-8183 settlement needs `BOSSRAID_SETTLEMENT_MODE=onchain` plus funded signers on **Robinhood + USDG**.
- Escrow contracts: `BossJobEscrow`, `RaidRegistry`, `BossBountyEscrow` (`packages/contracts`). Permissionless recovery after deadlines (forfeit, leftover refund, claim payout, job claimRefund).
- Privacy engine gates strict-private raids; privacy scoring ≠ reputation scoring.
- Hosted TEE runtime: Phala CVM (EigenCompute optional for judging lanes). Public host: **raid.quest** / **api.raid.quest**.

## Repo layout

See root [README.md](../../../README.md#repo-layout).
