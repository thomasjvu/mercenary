# Plan 004: Fix multi-award bounty delivered status

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/lib/bounty-service.ts apps/api/src/bounty-service.test.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

Bounties support `maxAwards > 1` (`bounty-service.ts:65`). `deliverAward` unconditionally sets bounty `status: 'delivered'` after the first delivery, but `awardBids` only allows statuses `open`, `funded`, or `awarded` (`:164-166`). Posters cannot award remaining slots after the first provider delivers.

## Current state

- `apps/api/src/lib/bounty-service.ts` — bounty lifecycle service.
- `apps/api/src/bounty-service.test.ts` — tests via `createTestBountyService` helper.

Problem excerpt (`apps/api/src/lib/bounty-service.ts:306-310`):

```typescript
this.store.saveBounty({
  ...bounty,
  status: 'delivered',
  updatedAt: nowIso,
});
```

Convention: tests in `bounty-service.test.ts` use `node:test` + `createTestBountyService` from `apps/api/src/test/helpers.js`.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
| --------- | ---------------------------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test -- bounty-service` | exit 0              |
| Typecheck | `pnpm check`                                         | exit 0              |

## Scope

**In scope**:

- `apps/api/src/lib/bounty-service.ts`
- `apps/api/src/bounty-service.test.ts`

**Out of scope**:

- Bounty routes (`routes/bounties.ts`) unless response serialization breaks
- Onchain escrow
- Docs (unless route behavior changes require `content/docs` update per AGENTS.md — only if public status semantics change)

## Git workflow

- Branch: `advisor/004-multi-award-bounty-status`
- Commits: `fix(api): keep multi-award bounties open until all awards delivered`
- Do NOT push unless instructed.

## Steps

### Step 1: Derive bounty status from award aggregates

In `deliverAward`, after saving the updated award:

1. Load all awards for the bounty from the store.
2. Compute whether all awards are in a terminal delivered/paid state (or whether any awards remain `in_progress` / not yet delivered).
3. Set bounty status:
   - `'awarded'` if any award still in progress and more awards could be granted OR not all awarded slots have delivered.
   - `'delivered'` only when every award for the bounty has reached `delivered` (or `paid`/`accepted` per existing enum).
4. If `maxAwards > 1` and fewer than `maxAwards` awards exist, keep `'awarded'` after partial delivery.

Add a private helper e.g. `resolveBountyStatusAfterDelivery(bounty, awards): BountyStatus` for clarity.

**Verify**: `pnpm --filter @bossraid/api test -- bounty-service` → existing tests pass

### Step 2: Add multi-award regression test

In `bounty-service.test.ts`:

1. Create bounty with `maxAwards: 2`.
2. Fund, submit two bids, award first bid only.
3. Deliver first award.
4. Assert bounty status is still `'awarded'` (not `'delivered'`).
5. Award second bid — must succeed (no 409).
6. Deliver second award; assert bounty becomes `'delivered'`.

**Verify**: `pnpm --filter @bossraid/api test -- bounty-service` → all tests pass

## Test plan

- New test: `multi-award bounty stays awarded after first delivery`
- Pattern: existing lifecycle test at `bounty-service.test.ts:7`

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/api test -- bounty-service` exits 0
- [ ] Multi-award test passes
- [ ] Single-award lifecycle test still passes
- [ ] Only in-scope files modified
- [ ] `plans/README.md` updated

## STOP conditions

- Bounty status enum or state machine documented differently in `packages/shared-types` — reconcile before changing.
- `awardBids` intentionally blocks multiple award rounds — report (contradicts `maxAwards` field).

## Maintenance notes

- Any new award terminal states must participate in aggregate status resolution.
- Reviewers: confirm Party Quest / bounty routes still list bounties correctly by status.
