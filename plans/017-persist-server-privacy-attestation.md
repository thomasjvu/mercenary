# Plan 017: Persist server-verified privacy attestation on submissions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d547ff6..HEAD -- apps/orchestrator/src/raid-provider-dispatch.ts apps/orchestrator/src/raid-provider-dispatch.test.ts`
> Compare "Current state" excerpts on mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/015-server-side-privacy-attestation-verify.md
- **Category**: correctness
- **Planned at**: commit `d547ff6`, 2026-06-21

## Why this matters

Plan 015 added server-side `verifySubmissionPrivacyAttestation` before compliance
scoring, but `applySubmissionToRaid` still persists the original provider
callback payload. Receipts, routing proof, and raid results can therefore show
client-supplied `featuresVerified` and TEE fields even when the server rejected
or recomputed them — undermining the audit trail eighth-pass intended to fix.

## Current state

Orchestrator dispatch (`apps/orchestrator/src/raid-provider-dispatch.ts`):

```typescript
// lines 481-490 — server attestation used for compliance only
if (verifyResult.attestation) {
  submissionForPrivacy = {
    ...normalizedSubmission,
    privacyAttestation: verifyResult.attestation,
  };
}
// line 523 — original payload persisted
applySubmissionToRaid(raid, normalizedSubmission, breakdown);
```

Tests (`apps/orchestrator/src/raid-provider-dispatch.test.ts`) assert
`breakdown` validity but not stored submission attestation shape.

Repo conventions: Node built-in test runner (`node --import tsx --test`);
conventional commits; AGENTS.md — privacy scoring ≠ reputation scoring.

## Commands you will need

| Purpose        | Command                                                                               | Expected on success |
| -------------- | ------------------------------------------------------------------------------------- | ------------------- |
| Typecheck      | `pnpm check`                                                                          | exit 0              |
| Dispatch tests | `cd apps/orchestrator && node --import tsx --test src/raid-provider-dispatch.test.ts` | all pass            |
| Lint           | `pnpm lint`                                                                           | exit 0              |

## Scope

**In scope**:

- `apps/orchestrator/src/raid-provider-dispatch.ts`
- `apps/orchestrator/src/raid-provider-dispatch.test.ts`

**Out of scope**:

- Changing verify logic in `verify-submission-attestation.ts`
- Web receipt rendering
- API route response shapes

## Git workflow

- Branch: `advisor/017-persist-server-privacy-attestation`
- Commit example: `fix(orchestrator): persist server-verified privacy attestation`
- Do NOT push unless instructed

## Steps

### Step 1: Persist server attestation on stored submission

In `submitResult`, after privacy verify block, define the submission to persist:

```typescript
const submissionToStore =
  submissionForPrivacy !== normalizedSubmission ? submissionForPrivacy : normalizedSubmission;
```

Pass `submissionToStore` to `applySubmissionToRaid` instead of
`normalizedSubmission`.

When `BOSSRAID_PRIVACY_SERVER_VERIFY=0` and no server recompute occurs,
behavior must remain unchanged (still stores client attestation).

**Verify**: `cd apps/orchestrator && node --import tsx --test src/raid-provider-dispatch.test.ts` → all pass

### Step 2: Add regression test for stored attestation

Extend `raid-provider-dispatch.test.ts`:

- With `BOSSRAID_PRIVACY_SERVER_VERIFY=0`, stored attestation matches client body.
- With `BOSSRAID_PRIVACY_SERVER_VERIFY=1` and forged client attestation, assert
  `raid.rankedSubmissions[0].submission.privacyAttestation` reflects server
  recomputed `featuresVerified` (empty or `tee_attested` only per verify path),
  not client `['tee_attested', 'e2ee']`.

Use existing `createStrictPrivacyRaid` helper (assignments need `providerRunId`).

**Verify**: dispatch tests ≥4 pass including new assertion

### Step 3: Full gates

**Verify**: `pnpm check` → exit 0

**Verify**: `pnpm lint` → exit 0

## Test plan

- Pattern: `apps/orchestrator/src/raid-provider-dispatch.test.ts` existing strict-privacy tests
- New case: stored `privacyAttestation.featuresVerified` differs from client when server verify on

## Done criteria

- [ ] `applySubmissionToRaid` receives server-verified submission when recompute occurred
- [ ] New test asserts stored attestation matches server view
- [ ] `pnpm check` and `pnpm lint` exit 0
- [ ] `plans/README.md` row 017 → DONE

## STOP conditions

- `applySubmissionToRaid` signature or raid state shape changed since excerpts.
- Persisting server attestation breaks synthesis path unexpectedly — report with ranked submission snapshot.

## Maintenance notes

- Reviewer: confirm receipt/routing proof pages show server attestation after fix.
- If provider-agent later signs declarations cryptographically, stored attestation becomes the canonical proof surface.
