# Plan 014: Fix host attestation trust model and cache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat fcbeaf9..HEAD -- apps/api/src/routes/host-attestation.ts packages/privacy-engine/src/attestation.ts apps/web/src/lib/runtime-attestation-status.ts apps/web/src/components/trust/HostTeeTrustStrip.tsx`
> Compare "Current state" excerpts on mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/013-attestation-characterization-tests.md
- **Category**: security
- **Planned at**: commit `fcbeaf9`, 2026-06-20

## Why this matters

The public host attestation endpoint is the trust surface for Phala CVM
deployments. Today it (a) skips Phala Cloud quote verification while marketplace
and provider paths can use cloud verify, (b) sets top-level `verified: true`
when only `signedRuntime` (MNEMONIC envelope) is present even if the TEE quote
failed, and (c) caches failed quotes for 10 minutes whenever a `signature`
field exists. Buyers and the web inspector can show "verified" without the
intended hardware proof tier.

## Current state

Host route (`apps/api/src/routes/host-attestation.ts`):

```typescript
// lines 75, 122 — both warmup and handler
skipCloudVerify: true,

// line 168
verified: Boolean(teeAttestation?.valid || signedRuntime),
```

Privacy engine cache (`packages/privacy-engine/src/attestation.ts` lines 89-91):

```typescript
if (result.signature) {
  cache.set(cacheKey, { result, expiresAt: now + cacheTtlMs });
}
```

Web status (`apps/web/src/lib/runtime-attestation-status.ts` lines 16-18):

```typescript
const verified = Boolean(input.data?.verified && (teeAttestation?.valid || signedRuntime));
```

Upstream cloud verify default (`packages/privacy-engine/src/upstream-tee/index.ts`):
`BOSSRAID_UPSTREAM_TEE_CLOUD_VERIFY !== '0'` enables cloud verify.

Deploy default socket: `/var/run/dstack.sock` (`deploy/phala/docker-compose.yml`).

AGENTS.md: do not mix privacy scoring and reputation scoring; document route
changes in `content/docs/reference/routes.md` and `content/docs/overview/proof.md`
(Plan 016 covers docs — only update routes/proof if behavior changes here).

## Commands you will need

| Purpose   | Command                                                                | Expected on success |
| --------- | ---------------------------------------------------------------------- | ------------------- |
| Typecheck | `pnpm check`                                                           | exit 0              |
| API tests | `cd apps/api && node --import tsx --test src/host-attestation.test.ts` | all pass            |
| Lint      | `pnpm lint`                                                            | exit 0              |

## Scope

**In scope**:

- `apps/api/src/routes/host-attestation.ts`
- `packages/privacy-engine/src/attestation.ts` (cache valid-only)
- `apps/web/src/lib/runtime-attestation-status.ts`
- `apps/web/src/components/trust/HostTeeTrustStrip.tsx` (if uses `verified` directly)
- `apps/api/src/host-attestation.test.ts` (update assertions)
- `packages/shared-types` — only if response type needs new fields

**Out of scope**:

- Orchestrator provider submit re-verification (Plan 015)
- Full docs pass (Plan 016) — add minimal route doc note if response shape changes
- Changing provider-agent default socket (still `tappd.sock` fallback in
  `privacy-attestation.ts` — separate follow-up)

## Git workflow

- Branch: `advisor/014-host-attestation-trust-model`
- Commit example: `fix(api): split host tee verified from signed runtime`
- Do NOT push unless instructed

## Steps

### Step 1: Cache only successful TEE verifications

In `packages/privacy-engine/src/attestation.ts`, change the cache write in
`verifyPhalaTeeAttestation` to:

```typescript
if (result.valid) {
  cache.set(cacheKey, { result, expiresAt: now + cacheTtlMs });
}
```

Update Plan 013 tests if they asserted old behavior.

**Verify**: `cd packages/privacy-engine && node --import tsx --test src/attestation.test.ts` → pass

### Step 2: Make host cloud verify configurable

In `apps/api/src/routes/host-attestation.ts`:

- Remove hardcoded `skipCloudVerify: true`
- Set `skipCloudVerify` from env, defaulting to cloud verify **on** in
  production-like deploys:
  - `skipCloudVerify: process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY === '1'`
- Keep existing RPC timeouts (`HOST_TEE_INFO_TIMEOUT_MS`, `HOST_TEE_GET_QUOTE_TIMEOUT_MS`)

Apply same logic in `warmupHostTeeAttestation`.

**Verify**: `pnpm check` → exit 0

### Step 3: Split `verified` from runtime signing

Change `HostAttestationResponse` to expose distinct signals. Minimum change:

```typescript
verified: Boolean(teeAttestation?.valid), // TEE quote only
// signedRuntime unchanged — consumers check it separately
```

If breaking change is unacceptable, add optional fields:

```typescript
teeVerified: Boolean(teeAttestation?.valid),
runtimeSigned: Boolean(signedRuntime),
```

and keep `verified` as alias for `teeVerified` only (document deprecation in
Plan 016). Pick one approach; prefer explicit `teeVerified` + `runtimeSigned`
if shared-types already exported to web.

Update `apps/api/src/host-attestation.test.ts`:

- MNEMONIC-only test: `verified` false, `runtimeSigned` true (or `signedRuntime` present)
- Add Phala mock success: `teeVerified` true when quote valid

**Verify**: `cd apps/api && node --import tsx --test src/host-attestation.test.ts` → pass

### Step 4: Align web status derivation

Update `apps/web/src/lib/runtime-attestation-status.ts` and
`HostTeeTrustStrip.tsx` so:

- "Verified" / ready tone requires `teeAttestation.valid === true` (or new `teeVerified`)
- Signed runtime shows a **separate** label (e.g. "Runtime signed") without
  implying TEE hardware verification

Match RX-78 tone patterns in existing trust components.

**Verify**: `pnpm --filter @bossraid/web check` → exit 0

### Step 5: Consolidate duplicate serializer (optional small)

If time permits within scope: move explorer URL fallback from
`host-attestation.ts` `serializeTeeAttestation` into
`apps/api/src/lib/serializers.ts` and reuse. Skip if it expands scope.

**Verify**: `pnpm lint` → exit 0

## Test plan

- Update `host-attestation.test.ts` for new response fields
- Regression: Phala missing socket still 503
- Regression: MNEMONIC path still returns `signedRuntime`

## Done criteria

- [ ] Failed TEE quotes are not cached for 10 minutes
- [ ] Host route uses cloud verify unless `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY=1`
- [ ] Top-level `verified` (or `teeVerified`) does not turn true from MNEMONIC alone
- [ ] Web inspector distinguishes TEE verified vs runtime signed
- [ ] `pnpm check` and `pnpm lint` exit 0
- [ ] `plans/README.md` row 014 → DONE

## STOP conditions

- Cloud verify causes >90s route latency in local test — STOP and report;
  propose async cache-only cloud verify instead of blocking request.
- Shared-types change breaks web build in unrelated packages — STOP with error list.
- Drift on cited excerpts.

## Maintenance notes

- Phala prod may need `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY=1` temporarily if
  cloud API is down — document in Plan 016 / env.md.
- Plan 015 should reuse the same verify options for provider submissions.
- Reviewer: confirm web receipt page still shows both proof types when available.
