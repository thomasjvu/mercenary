# Plan 015: Re-verify provider privacy attestations server-side

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat fcbeaf9..HEAD -- packages/privacy-engine/src/compliance.ts apps/orchestrator/src/raid-provider-dispatch.ts apps/api/src/handlers/ packages/api-contracts/src/parsers/provider-callbacks.ts`
> Compare excerpts on mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/013-attestation-characterization-tests.md (recommended), plans/014-host-attestation-trust-model.md (recommended)
- **Category**: security
- **Planned at**: commit `fcbeaf9`, 2026-06-20

## Why this matters

Strict-private raids gate settlement on `validateSubmissionPrivacy`, which
trusts `privacyAttestation.featuresVerified` supplied by the provider callback
(`packages/privacy-engine/src/compliance.ts` lines 85-87). A compromised or
malicious provider can self-assert `teeAttestation.valid: true` and pass
compliance without running in a TEE. This undermines the privacy engine's
purpose for strict mode (`examples/strict-private-raid.json`).

## Current state

Compliance gate (`packages/privacy-engine/src/compliance.ts`):

```typescript
const passed =
  errors.length === 0 &&
  requiredFeatures.every((f) => attestation && attestation.featuresVerified.includes(f));
```

Orchestrator dispatch (`apps/orchestrator/src/raid-provider-dispatch.ts` lines 477-494)
calls `validateSubmissionPrivacy(normalizedSubmission, requiredPrivacyFeatures, ...)`
on the submission as received — no server-side TEE recompute.

Provider agent (`apps/provider-agent/src/privacy-attestation.ts` lines 44-51)
marks `signed_outputs` and `no_data_retention` verified when `teeResult.valid`
only — no independent checks.

Parser (`packages/api-contracts/src/parsers/provider-callbacks.ts`) accepts
nested attestation fields from JSON body without verification.

Existing server verify patterns to mirror:

- `apps/api/src/lib/inference-gateway.ts` — hosted gateway TEE verify on accept
- `packages/privacy-engine/src/upstream-tee/index.ts` — `verifyUpstreamTeeAttestation`
- `verifyPhalaTeeAttestation` in `packages/privacy-engine/src/attestation.ts`

AGENTS.md: privacy scoring ≠ reputation scoring; successful providers split
payout equally; do not reintroduce winner/runner-up payout logic.

## Commands you will need

| Purpose       | Command                                                                               | Expected on success |
| ------------- | ------------------------------------------------------------------------------------- | ------------------- |
| Typecheck     | `pnpm check`                                                                          | exit 0              |
| Orchestrator  | `cd apps/orchestrator && node --import tsx --test src/raid-provider-dispatch.test.ts` | pass (extend)       |
| API contracts | `cd packages/api-contracts && pnpm check`                                             | exit 0              |
| Lint          | `pnpm lint`                                                                           | exit 0              |

## Scope

**In scope**:

- `packages/privacy-engine/src/compliance.ts` — optional server verify hook
- New module e.g. `packages/privacy-engine/src/verify-submission-attestation.ts`
- `apps/orchestrator/src/raid-provider-dispatch.ts` — call verify before compliance
- `apps/orchestrator/src/raid-provider-dispatch.test.ts`
- `apps/provider-agent/src/privacy-attestation.ts` — limit `featuresVerified` to
  `tee_attested` only (stop auto-verifying behavioral features from TEE validity)

**Out of scope**:

- Full cryptographic signing of `signedDeclaration` (future)
- Marketplace tee route changes
- Web UI changes
- Hosted gateway path (already verifies upstream) — only align feature mapping

## Git workflow

- Branch: `advisor/015-server-side-privacy-attestation-verify`
- Commit example: `fix(orchestrator): re-verify provider privacy attestations`
- Do NOT push unless instructed

## Steps

### Step 1: Add server-side attestation verifier in privacy-engine

Create `verifySubmissionPrivacyAttestation(input)` that:

1. Requires `attestation.providerId` and `attestation.raidId` match submission
2. For Phala platform providers: calls `verifyPhalaTeeAttestation` with
   `reportData: JSON.stringify({ providerId, raidId })` and production socket
   path from env (`BOSSRAID_TEE_SOCKET_PATH`, default `/var/run/dstack.sock`)
3. Compares recomputed `teeAttestation.valid` and quote hash/signature to body;
   reject on mismatch
4. Derives `featuresVerified`:
   - `tee_attested` only when recomputed TEE valid
   - Do **not** auto-verify `signed_outputs` / `no_data_retention` from TEE alone
5. Recomputes `signedDeclaration` via `buildSignedDeclaration` and flags mismatch
   as compliance error (warn first, error in strict mode)

Export from `packages/privacy-engine/src/index.ts`.

**Verify**: `cd packages/privacy-engine && node --import tsx --test src/verify-submission-attestation.test.ts` → pass (create tests with mocked tee)

### Step 2: Wire verifier into orchestrator strict path

In `raid-provider-dispatch.ts`, before `validateSubmissionPrivacy`:

```typescript
if (shouldValidatePrivacy && normalizedSubmission.privacyAttestation) {
  const verified = await verifySubmissionPrivacyAttestation({...});
  // replace or augment attestation on submission with server-derived fields
}
```

Strict mode (`privacyMode === 'strict'`): fail closed on verify errors.
Non-strict: attach warnings to `privacyComplianceDetails`.

**Verify**: extend `raid-provider-dispatch.test.ts` — self-asserted fake attestation
must fail strict compliance

### Step 3: Align provider-agent feature verification

In `apps/provider-agent/src/privacy-attestation.ts`:

- Only push `tee_attested` into `featuresVerified` when `teeResult.valid`
- Remove auto-verify of `signed_outputs` / `no_data_retention` from TEE validity
- Replace local `buildDeclaration` with `buildPrivacyAttestation` from
  `@bossraid/privacy-engine` (see DEBT-02 in audit)

**Verify**: `pnpm check` → exit 0

### Step 4: Add module-level provider tee cache

Mirror host route: module-level `Map` + 10 min TTL passed to
`verifyPhalaTeeAttestation` in provider-agent (audit PERF-04).

**Verify**: no functional regression in existing provider tests

## Test plan

- `verify-submission-attestation.test.ts` — match/mismatch providerId, fake valid tee
- `raid-provider-dispatch.test.ts` — strict raid rejects forged attestation
- Pattern: existing test at lines 105-120 that accepts self-asserted attestation
  should be updated to expect failure after fix

## Done criteria

- [ ] Strict-private path does not trust client-supplied `featuresVerified` alone
- [ ] Provider-agent no longer marks behavioral features verified from TEE only
- [ ] `pnpm check` and `pnpm lint` exit 0
- [ ] New unit tests pass
- [ ] `plans/README.md` row 015 → DONE

## STOP conditions

- Re-verification requires API package in orchestrator dependency graph changes
  that cascade beyond scope — STOP with dependency graph proposal.
- Phala socket unavailable in CI — use injectable mock; do not skip tests.
- Provider latency exceeds raid timeout — STOP and propose cached verify + async recheck.

## Maintenance notes

- If providers run without dstack socket (non-TEE dev), gate re-verify behind
  `BOSSRAID_PRIVACY_SERVER_VERIFY=0` for local dev only (document in env.md in Plan 016).
- Reviewer: confirm hosted inference gateway path still consistent.
