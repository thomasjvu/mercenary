# Plan 003: Fix evaluator capacity check-then-act race

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/evaluator/src/index.ts apps/evaluator/src/index.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

`POST /v1/runtime-probes` checks `activeJobs >= maxConcurrentJobs` then increments `activeJobs` in a separate statement. Concurrent requests can all pass the check before any increment, exceeding configured sandbox capacity and defeating backpressure.

## Current state

- `apps/evaluator/src/index.ts` — Fastify server; capacity gate at lines 114-132.
- `apps/evaluator/src/index.test.ts` — existing probe tests.

Problem excerpt (`apps/evaluator/src/index.ts:114-132`):

```typescript
if (activeJobs >= maxConcurrentJobs) {
  reply.code(503);
  return { error: 'evaluator_capacity_exhausted' };
}
// ... validation ...
activeJobs += 1;
```

Convention: mirror `RaidDeadlineTimerRegistry.tryMarkExpiring` in `apps/orchestrator/src/raid-timers.ts:38-44` — atomic mark-before-proceed pattern.

## Commands you will need

| Purpose         | Command                                  | Expected on success |
| --------------- | ---------------------------------------- | ------------------- |
| Evaluator tests | `pnpm --filter @bossraid/evaluator test` | exit 0              |
| Typecheck       | `pnpm check`                             | exit 0              |

## Scope

**In scope**:

- `apps/evaluator/src/index.ts`
- `apps/evaluator/src/index.test.ts` (optional concurrency characterization test)

**Out of scope**:

- `job-worker.ts` internals
- Sandbox runner package

## Git workflow

- Branch: `advisor/003-evaluator-capacity-race`
- Commits: `fix(evaluator): atomically reserve runtime probe capacity`
- Do NOT push unless instructed.

## Steps

### Step 1: Reserve capacity atomically

Replace check-then-increment with one of:

**Option A (preferred)**: Increment first, then if `activeJobs > maxConcurrentJobs`, decrement and return 503.

```typescript
activeJobs += 1;
if (activeJobs > maxConcurrentJobs) {
  activeJobs -= 1;
  reply.code(503);
  return { error: 'evaluator_capacity_exhausted' };
}
```

Ensure `finally` block still decrements on all paths after reservation.

**Option B**: Extract a small `tryReserveJobSlot(): boolean` helper with the same semantics.

Move reservation to immediately after auth passes, before expensive validation if possible (or immediately before `executeRuntimeProbeIsolated` if validation must stay first — but reservation must be atomic relative to concurrent requests).

**Verify**: `pnpm --filter @bossraid/evaluator test` → exit 0

### Step 2: Add capacity test (if feasible without flakiness)

Add a test that sets `maxConcurrentJobs` to 1 and fires two concurrent probe requests; assert exactly one succeeds and one gets 503. If too flaky in CI, document manual verification in PR description and skip automated concurrency test.

**Verify**: `pnpm --filter @bossraid/evaluator test` → exit 0

## Test plan

- Regression: existing probe tests still pass.
- Optional: concurrent capacity test as described.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/evaluator test` exits 0
- [ ] No window where two requests both pass `activeJobs >= maxConcurrentJobs` check before either increments
- [ ] Only in-scope files modified
- [ ] `plans/README.md` updated

## STOP conditions

- Evaluator handler structure changed to async queue — report and replan.
- Concurrency test cannot be made deterministic after 2 attempts — skip test, document manual verify.

## Maintenance notes

- Any new probe endpoints must use the same reservation helper.
- Reviewers: confirm `finally` always releases slot on early returns after reservation.
