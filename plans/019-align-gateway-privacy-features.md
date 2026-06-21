# Plan 019: Align hosted gateway privacy feature verification

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d547ff6..HEAD -- apps/api/src/lib/inference-gateway.ts apps/provider-agent/src/privacy-attestation.ts`
> Compare excerpts on mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/015-server-side-privacy-attestation-verify.md
- **Category**: security
- **Planned at**: commit `d547ff6`, 2026-06-21

## Why this matters

Plan 015 limited provider-agent `featuresVerified` to `tee_attested` (plus
explicit e2ee when `e2eeReady`). The hosted inference gateway still auto-marks
`signed_outputs` and `no_data_retention` verified whenever `teeResult.valid` —
the same trust gap Plan 015 closed on HTTP provider callbacks. Hosted sellers
are a production path (`POST /v1/inference/chat/completions` → gateway).

## Current state

Gateway (`apps/api/src/lib/inference-gateway.ts:181-194`):

```typescript
const featuresVerified: PrivacyFeatureKey[] = [];
if (teeResult.valid && featuresClaimed.includes('tee_attested')) {
  featuresVerified.push('tee_attested');
}
if (teeResult.valid && providerClaimsE2ee && teeResult.e2eeReady) {
  featuresClaimed.push('e2ee');
  featuresVerified.push('e2ee');
}
if (teeResult.valid && featuresClaimed.includes('signed_outputs')) {
  featuresVerified.push('signed_outputs');
}
if (teeResult.valid && featuresClaimed.includes('no_data_retention')) {
  featuresVerified.push('no_data_retention');
}
```

Provider-agent after Plan 015 (`apps/provider-agent/src/privacy-attestation.ts:35-38`):

```typescript
if (teeResult.valid && config.featuresClaimed.includes('tee_attested')) {
  featuresVerified.push('tee_attested');
}
```

AGENTS.md: do not mix privacy scoring and reputation scoring.

## Commands you will need

| Purpose       | Command                                                                                                        | Expected on success |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------------- |
| Typecheck     | `pnpm check`                                                                                                   | exit 0              |
| Gateway tests | `cd apps/api && node --import tsx --test src/marketplace-inference.test.ts` or gateway-specific test if exists | pass                |
| Lint          | `pnpm lint`                                                                                                    | exit 0              |

## Scope

**In scope**:

- `apps/api/src/lib/inference-gateway.ts`
- Gateway-related test file (grep for `inference-gateway` or `featuresVerified` in `apps/api/src`)

**Out of scope**:

- Marketplace tee attestation route (`/v1/marketplace/tee/attestation`)
- Provider-agent (already aligned)
- New behavioral verification for signed_outputs/no_data_retention

## Git workflow

- Branch: `advisor/019-align-gateway-privacy-features`
- Commit example: `fix(api): limit gateway privacy featuresVerified to proven claims`
- Do NOT push unless instructed

## Steps

### Step 1: Restrict gateway featuresVerified

In `inference-gateway.ts`, remove auto-verify of `signed_outputs` and
`no_data_retention` from TEE validity alone.

Keep:

- `tee_attested` when `teeResult.valid` and claimed
- `e2ee` when `teeResult.valid && teeResult.e2eeReady && providerClaimsE2ee`

Do not push behavioral features into `featuresVerified` without independent proof.

**Verify**: `pnpm check` → exit 0

### Step 2: Add or update test

Search `apps/api/src` for gateway privacy tests. If none exist, add assertion to
nearest marketplace/gateway test that `buildPrivacyAttestation` / submission
privacy payload does not include `signed_outputs` in `featuresVerified` when only
TEE valid.

Model after `apps/api/src/marketplace-tee.test.ts` mock patterns.

**Verify**: relevant test command passes

### Step 3: Lint

**Verify**: `pnpm lint` → exit 0

## Test plan

- Assert gateway `featuresVerified` ⊆ `{tee_attested, e2ee}` for TEE-valid mock path
- Regression: gateway still rejects invalid TEE when privacy claimed

## Done criteria

- [ ] Gateway no longer marks `signed_outputs` / `no_data_retention` from TEE alone
- [ ] Test covers restricted feature set
- [ ] `pnpm check` and `pnpm lint` exit 0
- [ ] `plans/README.md` row 019 → DONE

## STOP conditions

- Gateway path refactored; cited lines moved — re-read file and update plan before editing.
- Removing features breaks documented seller onboarding — STOP with affected UI/docs list.

## Maintenance notes

- When real signed-output or retention proofs exist, add explicit verification hooks before re-enabling those features.
- Reviewer: confirm hosted inference receipts still show TEE quote when valid.
