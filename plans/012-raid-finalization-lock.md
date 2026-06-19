# Plan 012: Serialize concurrent raid finalization

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/orchestrator/src/orchestrator-finalization.ts apps/orchestrator/src/orchestrator-settlement-runner.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

`maybeFinalizeAfterUpdate` fires `void finalizeRaid(...)` without checking if the raid is already terminal or finalization is in flight (`orchestrator-finalization.ts:126-148`). Two concurrent last-provider submissions can double-apply `successful_provider` reputation and issue duplicate onchain settlement transactions before `settlementExecution` is persisted.

## Current state

- `apps/orchestrator/src/orchestrator-finalization.ts` — `finalizeRaid`, `maybeFinalizeAfterUpdate`.
- `apps/orchestrator/src/orchestrator-settlement-runner.ts:49-64` — `shouldRunSettlement` skips only if `settlementExecution` already exists, not in-flight.
- `apps/orchestrator/src/raid-timers.ts:38-44` — `tryMarkExpiring` exemplar for per-raid mutex pattern.

Problem: `finalizeRaid` does not early-return when `TERMINAL_RAID_STATUSES.has(raid.status)` at entry.

## Commands you will need

| Purpose            | Command                                     | Expected on success |
| ------------------ | ------------------------------------------- | ------------------- |
| Orchestrator tests | `pnpm --filter @bossraid/orchestrator test` | exit 0              |
| Typecheck          | `pnpm check`                                | exit 0              |

## Scope

**In scope**:

- `apps/orchestrator/src/orchestrator-finalization.ts`
- `apps/orchestrator/src/raid-timers.ts` OR new `finalization-in-flight.ts` registry
- `apps/orchestrator/src/orchestrator-finalization.test.ts` (create)

**Out of scope**:

- Onchain executor internals
- Provider dispatch logic (except tests)

## Git workflow

- Branch: `advisor/012-raid-finalization-lock`
- Commits: `fix(orchestrator): serialize concurrent raid finalization`
- Do NOT push unless instructed.

## Steps

### Step 1: Add per-raid finalization lock

Create a small registry (extend `RaidDeadlineTimerRegistry` or separate class):

```typescript
tryMarkFinalizing(raidId: string): boolean
unmarkFinalizing(raidId: string): void
```

Pattern: copy `tryMarkExpiring` / `unmarkExpiring` from `raid-timers.ts`.

### Step 2: Guard `finalizeRaid` and `maybeFinalizeAfterUpdate`

1. At start of `finalizeRaid`: if `TERMINAL_RAID_STATUSES.has(raid.status)`, return immediately.
2. If `!tryMarkFinalizing(raid.id)`, return immediately (another finalization in flight).
3. Wrap body in `try/finally` with `unmarkFinalizing` in `finally`.
4. In `maybeFinalizeAfterUpdate`, optionally check terminal status before calling `void finalizeRaid`.

5. Consider awaiting finalization in tests; production can keep fire-and-forget but lock prevents overlap.

**Verify**: `pnpm --filter @bossraid/orchestrator test` → exit 0

### Step 3: Guard `executeSettlement` in-flight

In `executeSettlement` / `shouldRunSettlement`, consider a `settlementInFlight` Set per raidId so second caller waits or returns until first completes and persists `settlementExecution`.

Minimum: early return in `executeSettlement` if lock held.

**Verify**: `pnpm --filter @bossraid/orchestrator test` → exit 0

### Step 4: Characterization test

Create `orchestrator-finalization.test.ts`:

- Mock deps where `shouldFinalizeRaid` returns true.
- Call `maybeFinalizeAfterUpdate` twice concurrently for same raidId.
- Assert `finalizeRaidRecord` / `executeSettlement` called once (use counters in mock deps).

**Verify**: `pnpm --filter @bossraid/orchestrator test -- orchestrator-finalization` → pass

## Test plan

- Concurrent double-finalize invokes settlement once.
- Pattern: mock deps in `apps/orchestrator/src/raid-provider-dispatch.test.ts:58-61`.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/orchestrator test` exits 0
- [ ] Concurrent `maybeFinalizeAfterUpdate` cannot double-settle
- [ ] Terminal raids skip re-finalization
- [ ] `plans/README.md` updated

## STOP conditions

- Hierarchical parent/child finalization deadlocks with lock — report and adjust scope (parent/child may need separate locks).
- `finalizeRaid` is intentionally re-entrant for resume — document and use settlementExecution guard instead.

## Maintenance notes

- Any new finalization entry points must acquire the same lock.
- Reviewers: watch for deadlock if `finalizeRaid` awaits settlement while holding lock — release lock before long onchain awaits if needed.
