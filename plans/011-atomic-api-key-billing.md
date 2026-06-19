# Plan 011: Make API-key billing reservation atomic

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/handlers/payment.ts apps/api/src/control-state/buyer-ledger.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/010-streaming-api-key-billing.md
- **Category**: bug
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

`requireReservedLaunchPayment` checks `apiKey.spentUsd + amountUsd` and balance without reserving either (`payment.ts:269-287`). `captureApiKeyBilling` calls `debitBuyerBalance` but ignores its boolean return (`payment.ts:131-133`). Concurrent launches can exceed spend caps; capture can record usage while balance debit silently fails.

## Current state

- `apps/api/src/handlers/payment.ts` — reservation and capture.
- `apps/api/src/control-state/buyer-ledger.ts:138-154` — `debitBuyerBalance` returns false on insufficient funds.

Reservation excerpt (`payment.ts:269-287`):

```typescript
const spendCapOk =
  apiKey.spendLimitUsd == null || apiKey.spentUsd + amountUsd <= apiKey.spendLimitUsd;
const balanceOk = (account?.balanceUsd ?? 0) >= amountUsd;
```

Capture excerpt (`payment.ts:131-133`):

```typescript
ctx.controlState.recordBuyerApiKeyUsage(...);
if (input.apiKeyBilling.useBalance) {
  ctx.controlState.debitBuyerBalance(...); // return value ignored
}
```

Convention: control state mutations go through `writeState` in buyer-ledger — keep mutations in control-state layer, not handlers.

## Commands you will need

| Purpose   | Command                            | Expected on success |
| --------- | ---------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test` | exit 0              |
| Typecheck | `pnpm check`                       | exit 0              |

## Scope

**In scope**:

- `apps/api/src/handlers/payment.ts`
- `apps/api/src/control-state/buyer-ledger.ts` (add reserve/release helpers if needed)
- `apps/api/src/payment-api-key.test.ts` (create)

**Out of scope**:

- x402 payment path
- SQLite schema migration (memory/sqlite snapshot model stays)

## Git workflow

- Branch: `advisor/011-atomic-api-key-billing`
- Commits: `fix(api): atomically reserve API-key spend and balance`
- Do NOT push unless instructed.

## Steps

### Step 1: Add reservation helpers in buyer-ledger

Add functions:

- `reserveBuyerApiKeySpend(apiKeyId, amountUsd)` — atomically increment pending/reserved spend or fail if over cap
- `reserveBuyerBalance(wallet, amountUsd)` — hold balance or fail
- `releaseBuyerReservation(...)` — on spawn failure / refund
- `commitBuyerReservation(...)` — move reserved → spent on capture

Implementation options for sqlite/memory store:

1. **Pending reservation field** on API key record (`reservedUsd`).
2. Or single `writeState` read-modify-write with check inside `writeState` callback (serialized per process).

Pick approach matching existing `consumeRateLimit` pattern in control state.

**Verify**: `pnpm check` → exit 0

### Step 2: Reserve at `requireReservedLaunchPayment`

When API key auth:

1. Call reserve helpers instead of read-only checks.
2. On reservation failure → 402.
3. Store reservation id on `LaunchPaymentContext` for release on spawn failure.

Wire `reconcileLaunchPayment` / spawn failure paths to release reservation.

**Verify**: `pnpm check` → exit 0

### Step 3: Harden capture

In `captureApiKeyBilling`:

1. Commit reservation to final spend.
2. If `debitBuyerBalance` returns false, throw `ApiContractError` (500) and do NOT leave inconsistent usage — rollback usage increment if possible.

**Verify**: `pnpm --filter @bossraid/api test` → exit 0

### Step 4: Tests

Create `payment-api-key.test.ts`:

- Two concurrent reservations exceeding spend cap — second fails
- Capture with insufficient balance fails loudly
- Spawn failure releases reservation

**Verify**: `pnpm --filter @bossraid/api test -- payment-api-key` → exit 0

## Test plan

- Concurrency characterization (can be sequential simulation if true parallel is flaky).
- Spawn failure release.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] Reservation mutates state atomically
- [ ] `debitBuyerBalance` failure is not ignored
- [ ] Tests pass
- [ ] `plans/README.md` updated

## STOP conditions

- Control state architecture cannot support atomic reserve without full refactor — report.
- Fix requires touching x402 reservation — split scope.

## Maintenance notes

- Any new API-key billing entry points must use reserve/commit/release trio.
- Reviewers: verify spawn failure paths release reservations (grep `reconcileLaunchPayment`).
