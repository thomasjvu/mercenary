# Plan 039: Track pending settlement after initial failure

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 783eadf..HEAD -- apps/orchestrator/src/orchestrator-raid-lifecycle.ts`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `783eadf`, 2026-06-21

## Why this matters

The settlement retry worker (`retryPendingSettlements`) only processes raid IDs in
`pendingSettlementRaidIds`. `trackPendingSettlement` runs only after
`executeRaidSettlement` succeeds. When settlement throws (even after partial
artifact recovery in `orchestrator-settlement-runner.ts`), the raid is never
queued for in-process retry until process restart (`refreshPendingSettlementIndex`
on `resumeActiveRaids`). Final raids can sit with partial on-chain checkpoints
and no automatic retry for up to a full process lifetime.

## Current state

`apps/orchestrator/src/orchestrator-raid-lifecycle.ts:463-478`:

```typescript
private async executeSettlement(raidId: string): Promise<void> {
  if (!this.raidDeadlineTimers.tryMarkSettling(raidId)) {
    return;
  }
  try {
    await executeRaidSettlement(raidId, this.settlementRunnerDeps());
    const raid = this.raids.get(raidId);
    if (raid && shouldRunSettlement(raid)) {
      this.trackPendingSettlement(raidId);
    } else {
      this.untrackPendingSettlement(raidId);
    }
  } finally {
    this.raidDeadlineTimers.unmarkSettling(raidId);
  }
}
```

`orchestrator-settlement-runner.ts:104-112` — on executor failure, partial record
may be persisted, then error is rethrown.

Existing test pattern: `apps/orchestrator/src/orchestrator-settlement-runner.test.ts:123-184`.

## Commands you will need

| Purpose            | Command                                     | Expected on success |
| ------------------ | ------------------------------------------- | ------------------- |
| Orchestrator tests | `pnpm --filter @bossraid/orchestrator test` | all pass            |
| Typecheck          | `pnpm check`                                | exit 0              |

## Scope

**In scope**:

- `apps/orchestrator/src/orchestrator-raid-lifecycle.ts`
- `apps/orchestrator/src/orchestrator-settlement-lifecycle.test.ts` (create) or extend existing lifecycle test file

**Out of scope**:

- Onchain executor behavioral depth (plan 184 deferred)
- API settlement routes
- Changing `shouldRunSettlement` semantics

## Git workflow

- Branch: `advisor/039-track-settlement-retry-on-failure`
- Commit example: `fix(orchestrator): queue settlement retry after executor failure`
- Do NOT push unless instructed

## Steps

### Step 1: Add catch path to queue retries

Wrap the `try` body in `executeSettlement` with a `catch`:

```typescript
} catch (error) {
  const raid = this.raids.get(raidId);
  if (raid && shouldRunSettlement(raid)) {
    this.trackPendingSettlement(raidId);
  }
  throw error;
}
```

Keep existing success-path `trackPendingSettlement` / `untrackPendingSettlement`
logic unchanged.

**Verify**: read method — both success and failure paths can add to pending set.

### Step 2: Add characterization test

Create a focused test that:

1. Builds a minimal orchestrator/lifecycle stub OR tests via a package-level helper
   exposing `executeSettlement` + `pendingSettlementRaidIds`.
2. Mocks `executeRaidSettlement` to throw after setting `raid.settlementExecution`
   to `{ lifecycleStatus: 'partial', mode: 'onchain', ... }` on a `final` raid.
3. Asserts `pendingSettlementRaidIds` contains the raid ID after the thrown call.

If lifecycle is hard to instantiate, extract the catch/track logic into a small
exported helper in `orchestrator-raid-lifecycle.ts` and unit-test that helper.

Model after `orchestrator-settlement-runner.test.ts` (`node:assert/strict`).

**Verify**: `pnpm --filter @bossraid/orchestrator test` → new test passes.

### Step 3: Regression suite

```bash
pnpm check
pnpm --filter @bossraid/orchestrator test
```

## Test plan

- One new test for failure → pending queue.
- Existing settlement-runner tests must still pass.

## Done criteria

- [ ] Failed settlement with `shouldRunSettlement(raid) === true` enqueues retry
- [ ] Orchestrator tests pass
- [ ] `pnpm check` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- `executeSettlement` callers expect failures to leave pending set empty — STOP with call graph.
- Test requires full onchain harness — use mocked executor only.

## Maintenance notes

- Any new settlement entry points must use the same track-on-failure semantics.
- Pairs with deferred CORRECTNESS-06 (finalize error surfacing) but does not require it.
