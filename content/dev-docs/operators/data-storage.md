# Data Storage

Boss Raid persistence is **SQLite, Postgres, or in-memory** — no separate user-profile service. State is split across SQLite files or a Postgres database with the same JSON snapshot tables.

Product-facing summary: [Privacy & data](/docs/overview/privacy-and-data).

## v1 posture

| Mode                        | Backend                                         | When                                                                                                  |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **OSS / controlled launch** | SQLite (default)                                | Single API process; production-readiness **warns** on SQLite                                          |
| **Managed durable**         | **Postgres** (`@bossraid/persistence-postgres`) | `BOSSRAID_STORAGE_BACKEND=postgres` + `BOSSRAID_DATABASE_URL` — raids + control-state; **not Convex** |
| **Tests**                   | `memory`                                        | Ephemeral only                                                                                        |

SQLite remains the intentional OSS default. Postgres is for managed backups / larger single-tenant deploys. Control-state on Postgres uses an in-memory working copy with durable write-through (prefer **one API writer** until multi-writer async control plane).

## Backends

| Env                        | Default  | Behavior                                             |
| -------------------------- | -------- | ---------------------------------------------------- |
| `BOSSRAID_STORAGE_BACKEND` | `sqlite` | Durable local files                                  |
| `postgres`                 | —        | Requires `BOSSRAID_DATABASE_URL` (or `DATABASE_URL`) |
| `memory`                   | —        | Ephemeral; dev/tests only                            |
| `BOSSRAID_DATABASE_URL`    | —        | Postgres URL when backend is `postgres`              |

## SQLite files

| File env                           | Default path                         | Contents                                                                             |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `BOSSRAID_SQLITE_FILE`             | `./temp/bossraid-state.sqlite`       | Orchestrator raids/providers **and** API control state (same file, different tables) |
| `BOSSRAID_BOUNTY_SQLITE_FILE`      | separate path                        | Bounty marketplace                                                                   |
| `BOSSRAID_INFERENCE_RECEIPTS_FILE` | falls back to `BOSSRAID_SQLITE_FILE` | Inference attestation receipts only                                                  |

## Orchestrator tables (`packages/persistence-sqlite`)

Single-row meta plus JSON payload rows:

| Table                        | Key              | Payload                                                            |
| ---------------------------- | ---------------- | ------------------------------------------------------------------ |
| `bossraid_meta`              | `key = 1`        | Schema version, `saved_at`                                         |
| `raid_records`               | `raid_id`        | Full raid snapshot (status, routing, settlement, outputs metadata) |
| `provider_records`           | `provider_id`    | Registered seller/provider registry entry                          |
| `launch_reservation_records` | `reservation_id` | Pre-spawn billing reservations                                     |

Implementation: `packages/persistence-sqlite/src/index.ts`.

## Postgres (`packages/persistence-postgres`)

Same table names and JSON payload shape as SQLite. Set:

```bash
BOSSRAID_STORAGE_BACKEND=postgres
BOSSRAID_DATABASE_URL=postgres://user:pass@host:5432/bossraid
# DATABASE_URL is accepted as a fallback
```

| Surface                                       | Package / class                | Notes                                                                                                                        |
| --------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator raids / providers / reservations | `PostgresBossRaidPersistence`  | Async load/save; shared with SQLite schema                                                                                   |
| API control state                             | `PostgresApiControlStateStore` | Load once at boot via `createApiControlStateStoreAsync`; sync mutate path keeps an in-memory copy and write-through persists |

Prefer **one API process** as the control-state writer. Multi-replica API + shared Postgres control-state needs a later async control plane.

Live adapter test (optional):

```bash
BOSSRAID_DATABASE_URL=postgres://... pnpm --filter @bossraid/persistence-postgres test
```

Implementation: `packages/persistence-postgres/src/index.ts`.

## API control state (`apps/api/src/control-state/store.ts`)

One encrypted snapshot row:

| Table                        | Columns                                       |
| ---------------------------- | --------------------------------------------- |
| `bossraid_api_control_state` | `key`, `version`, `saved_at`, `snapshot_json` |

`snapshot_json` holds:

| Snapshot array / object                      | Purpose                                           |
| -------------------------------------------- | ------------------------------------------------- |
| `publicAccounts`                             | Wallet → balance, seller provider ids, timestamps |
| `publicSessions`                             | Session token, wallet, expiry                     |
| `publicAuthNonces`                           | Wallet sign-in nonces                             |
| `buyerApiKeys`                               | Key id, wallet, **keyHash**, prefix, spend limits |
| `buyerPurchases`                             | Per-call purchase ledger                          |
| `sellerPayouts`                              | Seller earnings records                           |
| `sellerUpstreamConfigs`                      | Encrypted upstream API keys + catalog offers      |
| `agentPaymentSessions`                       | MCP / ERC-7710 agent payment grants               |
| `opsSessions`                                | Admin ops UI tokens                               |
| `rateLimits`                                 | Per-key rate limit counters                       |
| `relayerTasks`                               | 1Shot relayer task tracking                       |
| `x402Reconciliations`, `x402SettledPayments` | Payment reconciliation                            |
| `settings`                                   | Runtime toggles (`x402Enabled`, etc.)             |

Seller upstream keys are encrypted with `BOSSRAID_SECRET_ENCRYPTION_KEY` before landing in the snapshot.

## Bounty tables (`apps/api/src/lib/bounty-store.ts`)

| Table                         | Purpose                 |
| ----------------------------- | ----------------------- |
| `bounty_records`              | Bounty posts            |
| `bounty_bid_records`          | Agent bids              |
| `bounty_award_records`        | Awards                  |
| `bounty_event_records`        | Audit trail             |
| `bounty_funding_locks`        | Concurrent fund guard   |
| `bounty_award_payment_claims` | Payout claim dedup      |
| `bounty_worker_locks`         | Background worker locks |

## Inference receipts (`apps/api/src/lib/inference-receipt-store.ts`)

| Table                            | Purpose                                                |
| -------------------------------- | ------------------------------------------------------ |
| `inference_attestation_receipts` | `receipt_id`, `completed_at`, attestation payload JSON |

Served at `GET /v1/inference/receipts/:receiptId`.

## What is not in SQLite

- **Raw prompts in a dedicated PII table** — content lives inside raid payloads and provider submissions as job data, not a separate CRM schema.
- **Central email/password auth** — wallet signature sessions only for public buyers/sellers.
- **File-backed persistence** — orchestrator/API do not write raid state to loose JSON files in production (settlement artifacts may write to `BOSSRAID_SETTLEMENT_DIR` when `BOSSRAID_SETTLEMENT_MODE=file`).

## Retention & pruning

- Session and nonce entries expire by TTL and are pruned on read (`readPrunedState`).
- Raid records persist for receipts, ops, and settlement — no automatic user-triggered wipe in the open-source stack.
- Operators control retention via SQLite file rotation or managed Postgres backups.

## Related

- Env vars: [reference/env.md](/docs/reference/env) — Tier 1 storage paths
- Architecture: [architecture.md](/docs/operators/architecture.md)
- Infisical / production secrets: [infisical.md](infisical.md)
