# Data Storage

Boss Raid persistence is **SQLite or in-memory** — no separate user-profile service. State is split across a few files and JSON snapshot tables.

Product-facing summary: [Privacy & data](/docs/overview/privacy-and-data).

## v1 posture

| Mode                        | Backend                    | When                                                                                                                                |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **OSS / controlled launch** | SQLite (default)           | Single API process on Phala CVM or local disk; production-readiness allows SQLite with a **storage warning**                        |
| **Full multi-replica HA**   | Postgres (planned adapter) | Multiple API instances, managed backups, connection pooling — **not Convex** (wrong trust boundary for TEE secrets + money ledgers) |
| **Tests**                   | `memory`                   | Ephemeral only                                                                                                                      |

SQLite is not a “shim”: it is the intentional v1 default. The gap is **horizontal scale**, not correctness for single-tenant launch.

## Backends

| Env                        | Default  | Behavior                  |
| -------------------------- | -------- | ------------------------- |
| `BOSSRAID_STORAGE_BACKEND` | `sqlite` | Durable local files       |
| `memory`                   | —        | Ephemeral; dev/tests only |

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
- Operators control disk retention by backup policy and SQLite file rotation in deploy.

## Related

- Env vars: [reference/env.md](/docs/reference/env) — Tier 1 storage paths
- Architecture: [architecture.md](/docs/operators/architecture.md)
- Infisical / production secrets: [infisical.md](infisical.md)
