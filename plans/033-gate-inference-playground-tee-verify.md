# Plan 033: Gate inference playground on TEE verification

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e204b19..HEAD -- apps/web/src/hooks/useInferencePlayground.ts apps/web/src/components/marketplace/InferencePlayground.tsx`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e204b19`, 2026-06-21

## Why this matters

The marketplace inference playground advertises that TEE verification runs before
each TEE/strict-E2EE request. Today `useInferencePlayground` sets a failure
status when `verifyMarketplaceTeeAttestation` returns `valid: false`, but still
calls `runInferenceChatCompletion`. A later receipt id can overwrite the failure
status with "TEE verified · inference receipt issued". Users can run inference
after a failed preflight check and see contradictory trust copy.

## Current state

- `apps/web/src/hooks/useInferencePlayground.ts:251-279` — TEE verify runs, but
  inference always proceeds; receipt id overwrites `teeStatus` unconditionally.
- `apps/web/src/components/marketplace/InferencePlayground.tsx` — UI copy claims
  verification before TEE/strict-E2EE runs.
- Web tests use `node:test` under `apps/web/src/**/*.test.ts` (see
  `apps/web/src/lib/marketplace-trust.test.ts` for pattern).

Relevant excerpt:

```typescript
// useInferencePlayground.ts ~251-279
if (selectedModel?.teeAttested || strictE2ee) {
  const attestation = await verifyMarketplaceTeeAttestation({ ... });
  setTeeStatus(attestation.valid ? 'TEE verified' : 'TEE verification failed');
}
const result = await runInferenceChatCompletion({ ... }); // always runs
if (receiptId) {
  setTeeStatus('TEE verified · inference receipt issued'); // overwrites failure
}
```

## Commands you will need

| Purpose   | Command                            | Expected on success |
| --------- | ---------------------------------- | ------------------- |
| Typecheck | `pnpm check`                       | exit 0              |
| Web tests | `pnpm --filter @bossraid/web test` | all pass            |
| Lint      | `pnpm lint`                        | exit 0              |

## Scope

**In scope**:

- `apps/web/src/hooks/useInferencePlayground.ts`
- `apps/web/src/hooks/useInferencePlayground.test.ts` (create)
- `apps/web/src/components/marketplace/InferencePlayground.tsx` (only if copy tweak needed)

**Out of scope**:

- Server-side gateway enforcement (`apps/api` hosted inference paths)
- Marketplace TEE badge copy elsewhere (plan 037)
- Attestation inspector sidebar behavior

## Git workflow

- Branch: `advisor/033-gate-inference-playground-tee-verify`
- Commit example: `fix(web): block playground inference after TEE verify failure`
- Do NOT push unless instructed

## Steps

### Step 1: Abort inference when TEE preflight fails

In `useInferencePlayground.ts`, inside `handleRun`:

1. When `selectedModel?.teeAttested || strictE2ee`, await
   `verifyMarketplaceTeeAttestation`.
2. If `!attestation.valid`, set `teeStatus` to `'TEE verification failed'`,
   set a user-visible error via `setError`, and **return** before
   `runInferenceChatCompletion`.
3. For `strictE2ee`, also require `attestation.e2eeReady` (if exposed on the
   attestation response); if missing/false, abort with a clear message.

Track a local `teePreflightPassed` boolean (default true when verify skipped).

**Verify**: `rg "runInferenceChatCompletion" apps/web/src/hooks/useInferencePlayground.ts` still present once, after the guard.

### Step 2: Stop receipt from overwriting failed preflight

When setting receipt-based status:

- Only promote to `'TEE verified · inference receipt issued'` when
  `teePreflightPassed` is true (or TEE verify was not required for this run).
- If preflight failed, do not reach inference — no receipt branch needed.
- If preflight passed and receipt exists, keep composite success copy.

**Verify**: read `handleRun` — no path sets success TEE status after a failed verify.

### Step 3: Add regression tests

Create `apps/web/src/hooks/useInferencePlayground.test.ts`.

Extract minimal testable helpers if needed (e.g. export a pure function
`shouldRunInferenceAfterTeeVerify(attestation, options)`), or mock API modules
with `node:test` `mock.module`.

Required cases:

1. Failed `attestation.valid` → inference runner not called.
2. Passed verify → inference runner called.
3. Failed verify + hypothetical receipt id → status stays failure (if testable
   via helper).

Model after `apps/web/src/lib/marketplace-trust.test.ts` (`node:assert/strict`).

**Verify**: `pnpm --filter @bossraid/web test` → new tests pass.

### Step 4: Full verification

```bash
pnpm check
pnpm lint
pnpm --filter @bossraid/web test
```

## Test plan

- New file `useInferencePlayground.test.ts` with at least 2 cases above.
- No snapshot tests.

## Done criteria

- [ ] Playground does not call `runInferenceChatCompletion` when TEE verify fails
- [ ] Receipt success copy cannot overwrite a failed TEE preflight
- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/web test` passes including new tests
- [ ] `plans/README.md` status row updated

## STOP conditions

- `verifyMarketplaceTeeAttestation` response shape lacks `e2eeReady` and strict
  E2EE gate cannot be implemented without API change — STOP with response type.
- Hook is too entangled to test without large refactor — extract one pure helper
  only; do not rewrite the whole marketplace page.

## Maintenance notes

- Any new preflight checks (E2EE, privacy mode) must gate inference the same way.
- Plan 037 handles catalog "tee claimed" badges; this plan is the live-verify gate.
