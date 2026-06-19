# Plan 001: Isolate x402 reconciliation per-entry errors

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/lib/x402-reconciliation.ts apps/api/src/lib/x402-reconciliation.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

The x402 reconciliation worker processes pending refund rows sequentially. A single row with invalid `paymentRequiredJson` throws from `JSON.parse` inside the loop, aborting the entire batch. Later pending refunds are skipped until the corrupt row is manually removed, delaying buyer refunds after failed spawns or bounty funds.

## Current state

- `apps/api/src/lib/x402-reconciliation.ts` — reconciliation queue processor; `processX402ReconciliationQueue` iterates pending entries.
- `apps/api/src/lib/x402-reconciliation.test.ts` — existing happy-path test using `installMockX402Facilitator`.

Problem excerpt (`apps/api/src/lib/x402-reconciliation.ts:99-111`):

```typescript
for (const entry of pending) {
  // ... max attempts check ...
  const paymentRequired = JSON.parse(entry.paymentRequiredJson) as X402PaymentRequired;
  try {
    await refundPayment(...);
```

`JSON.parse` is outside the per-entry `try/catch`; only refund failures are caught.

Convention: tests use `node:test` + `node:assert/strict` and `installMockX402Facilitator` from `apps/api/src/test/helpers.js` — model after `x402-reconciliation.test.ts`.

## Commands you will need

| Purpose   | Command                            | Expected on success |
| --------- | ---------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test` | exit 0              |
| Typecheck | `pnpm check`                       | exit 0              |

## Scope

**In scope**:

- `apps/api/src/lib/x402-reconciliation.ts`
- `apps/api/src/lib/x402-reconciliation.test.ts`

**Out of scope**:

- Facilitator client (`x402-facilitator.ts`)
- Route handlers
- Docs

## Git workflow

- Branch: `advisor/001-x402-reconciliation-per-entry-errors`
- Commits: conventional commits, e.g. `fix(api): isolate x402 reconciliation parse errors`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Wrap parse and refund in per-entry try/catch

Move `JSON.parse(entry.paymentRequiredJson)` inside the existing per-entry `try` block, or add an outer try/catch per entry that:

1. On parse or refund failure: increment `attempts`, set `lastError` to the error message, call `upsertX402Reconciliation` (status stays `pending` until `MAX_ATTEMPTS`, then `failed` as today).
2. Increment `x402.reconciliation_retry_failed` metric on failure (already done for refund failures).
3. `continue` to the next entry — never throw out of the loop.

**Verify**: `pnpm --filter @bossraid/api test -- x402-reconciliation` → exit 0

### Step 2: Add regression test for corrupt JSON row

In `x402-reconciliation.test.ts`, add a test that:

1. Inserts two pending rows: one with `paymentRequiredJson: 'not-json'`, one valid (copy pattern from existing test).
2. Calls `processX402ReconciliationQueue(ctx)`.
3. Asserts valid row completes (`status: 'completed'`) and corrupt row has `attempts >= 1` and `lastError` set.

**Verify**: `pnpm --filter @bossraid/api test -- x402-reconciliation` → 2+ tests pass

## Test plan

- New test: corrupt JSON does not block sibling refund.
- Pattern: `apps/api/src/lib/x402-reconciliation.test.ts` existing test at line 9.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/api test` exits 0; new corrupt-json test passes
- [ ] `JSON.parse` for reconciliation entries cannot throw out of `processX402ReconciliationQueue`
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `x402-reconciliation.ts` structure differs materially from excerpts (drift).
- Fix requires changing refund semantics in `x402-facilitator.ts`.
- Verification fails twice after reasonable fix attempt.

## Maintenance notes

- If new reconciliation entry fields are added, keep per-entry isolation — never let one row abort the worker.
- Reviewers: confirm corrupt rows eventually reach `failed` after `MAX_ATTEMPTS`.
