# Plan 002: Map unknown onchain job status explicitly

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- packages/raid-core/src/settlement-lifecycle.ts packages/shared-types`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

`mapJobLifecycleStatus` returns `'open'` for any unrecognized onchain status uint. Settlement proof refresh then shows "client funding required" guidance for jobs that may actually be completed, rejected, or in an unknown contract state — misleading operators and buyers during onchain settlement recovery.

## Current state

- `packages/raid-core/src/settlement-lifecycle.ts` — `mapJobLifecycleStatus` and `buildChildJobNextAction`.
- `apps/api/src/settlement-proof.ts` — consumes mapped status for proof refresh.

Problem excerpt (`packages/raid-core/src/settlement-lifecycle.ts:46-62`):

```typescript
export function mapJobLifecycleStatus(status: number): SettlementChildJobLifecycleStatus {
  switch (status) {
    case 0:
      return 'open';
    // ... cases 1-5 ...
    default:
      return 'open';
  }
}
```

Convention: raid-core tests use `node:test` in colocated `*.test.ts` files — see `packages/raid-core/src/pricing.test.ts`.

## Commands you will need

| Purpose           | Command                                                | Expected on success |
| ----------------- | ------------------------------------------------------ | ------------------- |
| raid-core tests   | `pnpm --filter @bossraid/raid-core test`               | exit 0              |
| Typecheck         | `pnpm check`                                           | exit 0              |
| API tests (proof) | `pnpm --filter @bossraid/api test -- settlement-proof` | exit 0              |

## Scope

**In scope**:

- `packages/raid-core/src/settlement-lifecycle.ts`
- `packages/raid-core/src/settlement-lifecycle.test.ts` (create)
- `packages/shared-types/src/domain/settlement.ts` (if `SettlementChildJobLifecycleStatus` union needs `'unknown'`)
- `apps/api/src/settlement-proof.ts` (only if `buildChildJobNextAction` message handling needs update)

**Out of scope**:

- Smart contract changes
- Orchestrator executor

## Git workflow

- Branch: `advisor/002-unknown-onchain-status`
- Commits: `fix(raid-core): map unknown onchain job status explicitly`
- Do NOT push unless instructed.

## Steps

### Step 1: Add `'unknown'` lifecycle status

1. Extend `SettlementChildJobLifecycleStatus` in shared-types to include `'unknown'` (if not already present).
2. Change `mapJobLifecycleStatus` default branch to return `'unknown'`.
3. Update `isTerminalChildJobStatus` — `'unknown'` should NOT be terminal.
4. Update `buildChildJobNextAction` to return a generic message for `'unknown'`, e.g. `"Unrecognized onchain job status; verify contract state manually."` instead of open-state funding guidance.

**Verify**: `pnpm --filter @bossraid/raid-core test` → exit 0 (or pass if no tests yet)

### Step 2: Add unit tests

Create `packages/raid-core/src/settlement-lifecycle.test.ts`:

- `mapJobLifecycleStatus(0)` → `'open'`
- `mapJobLifecycleStatus(3)` → `'completed'`
- `mapJobLifecycleStatus(99)` → `'unknown'`
- `buildChildJobNextAction` for `'unknown'` returns non-null warning string, not funding prompt

**Verify**: `pnpm --filter @bossraid/raid-core test` → all pass including new file

### Step 3: Verify settlement proof consumers

Run API settlement-proof tests; fix any exhaustive switch errors if TypeScript complains about new union member.

**Verify**: `pnpm --filter @bossraid/api test -- settlement-proof` → exit 0

## Test plan

- New file `settlement-lifecycle.test.ts` with cases above.
- Pattern: `packages/raid-core/src/pricing.test.ts`

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/raid-core test` exits 0
- [ ] `mapJobLifecycleStatus(999)` returns `'unknown'`, not `'open'`
- [ ] Only in-scope files modified
- [ ] `plans/README.md` updated

## STOP conditions

- Contract enum already has case 6+ documented elsewhere with different semantics — report before mapping.
- Adding `'unknown'` breaks more than 5 downstream switches — report scope expansion.

## Maintenance notes

- When contract adds new status enums, update the switch — never fall back to `'open'`.
- Reviewers: check settlement proof UI still renders `'unknown'` sensibly.
