# Plan 018: Block unsafe attestation env flags in production readiness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d547ff6..HEAD -- apps/api/src/lib/production-readiness.ts apps/api/src/routes/health.ts`
> Compare excerpts on mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/014-host-attestation-trust-model.md, plans/015-server-side-privacy-attestation-verify.md
- **Category**: security
- **Planned at**: commit `d547ff6`, 2026-06-21

## Why this matters

Eighth-pass attestation hardening introduced env flags for dev bypass:
`BOSSRAID_PRIVACY_SERVER_VERIFY=0` (skip server privacy re-verify) and
`BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY=1` (structural TDX only). Production
readiness already blocks upstream mocks and unverified fund bypasses, but does
not block these attestation weakeners — so `GET /v1/ops/production-readiness`
can report `ok: true` while strict-private raids trust client attestations or
skip Phala Cloud quote verification.

## Current state

Privacy verify skip (`packages/privacy-engine/src/verify-submission-attestation.ts:37-38`):

```typescript
function isServerVerifyEnabled(): boolean {
  return process.env.BOSSRAID_PRIVACY_SERVER_VERIFY !== '0';
}
```

Host cloud-verify skip (`apps/api/src/routes/host-attestation.ts:38-39`):

```typescript
function hostSkipCloudVerify(): boolean {
  return process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY === '1';
}
```

Production readiness (`apps/api/src/lib/production-readiness.ts`) has blocking
checks for `unverified_balance_fund`, `unverified_bounty_fund`,
`upstream_mocks_disabled` (lines 135-170) but no checks for the attestation flags.

Tests: `apps/api/src/lib/production-readiness.test.ts` — pattern for blocking checks.

Public `/ready` (`apps/api/src/routes/health.ts:79-114`) computes `gates` but
does not surface the new flags; optional mirror for operator visibility.

## Commands you will need

| Purpose   | Command                                                                        | Expected on success |
| --------- | ------------------------------------------------------------------------------ | ------------------- |
| Typecheck | `pnpm check`                                                                   | exit 0              |
| Tests     | `cd apps/api && node --import tsx --test src/lib/production-readiness.test.ts` | all pass            |
| Lint      | `pnpm lint`                                                                    | exit 0              |

## Scope

**In scope**:

- `apps/api/src/lib/production-readiness.ts`
- `apps/api/src/lib/production-readiness.test.ts`
- `content/docs/reference/env.md` (document blocking behavior for production)

**Out of scope**:

- Requiring MNEMONIC in production (deferred finding 154)
- Changing default env values in deploy templates
- `/ready` response slimming (Plan 007 docs debt)

## Git workflow

- Branch: `advisor/018-production-readiness-attestation-gates`
- Commit example: `fix(api): block attestation bypass flags in production readiness`
- Do NOT push unless instructed

## Steps

### Step 1: Add blocking checks to production readiness

In `buildProductionReadinessReport`, after `upstream_mocks_disabled` check, add:

1. **`privacy_server_verify_enabled`**
   - Fail when `productionEnv && env.BOSSRAID_PRIVACY_SERVER_VERIFY === '0'`
   - Message: server-side provider privacy re-verify must not be disabled in production.

2. **`host_tee_cloud_verify_enabled`**
   - Fail when `productionEnv && env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY === '1'`
   - Message: Phala Cloud quote verification must not be skipped in production.

Follow existing `addCheck` pattern with `severity: 'blocking'`.

Include both in `report.ok` aggregation (same as other blocking checks).

**Verify**: `cd apps/api && node --import tsx --test src/lib/production-readiness.test.ts` → pass

### Step 2: Extend production-readiness tests

Add two tests mirroring `unverified_bounty_fund` test:

- `BOSSRAID_PRIVACY_SERVER_VERIFY=0` → `privacy_server_verify_enabled` fails, `report.ok` false
- `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY=1` → `host_tee_cloud_verify_enabled` fails, `report.ok` false

Non-production (`NODE_ENV !== 'production'`) must still pass with flags set.

**Verify**: production-readiness tests ≥4 pass

### Step 3: Document env blocking in env.md

Under attestation section in `content/docs/reference/env.md`, note both flags
are blocked when `NODE_ENV=production` and production-readiness is used.

**Verify**: `pnpm format:check` on edited md → pass

### Step 4: Full gates

**Verify**: `pnpm check` → exit 0

**Verify**: `pnpm lint` → exit 0

## Test plan

- Pattern: `apps/api/src/lib/production-readiness.test.ts:62-73`
- Two new negative cases for attestation env flags

## Done criteria

- [ ] Production readiness fails when privacy server verify disabled in production
- [ ] Production readiness fails when host cloud verify skipped in production
- [ ] Tests cover both checks
- [ ] `env.md` documents production blocking
- [ ] `plans/README.md` row 018 → DONE

## STOP conditions

- Production readiness report shape changed (no `checks` array) — STOP with diff.
- Phala operators require `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY=1` in prod today — STOP and propose warn-only severity instead.

## Maintenance notes

- If Phala Cloud outage requires temporary prod skip, use ops override doc rather than permanent gate removal.
- Finding 154 (MNEMONIC production gate) remains separate; do not conflate in this plan.
