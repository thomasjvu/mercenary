# Plan 024: Align receipt host verified with trust model

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4ed256f..HEAD -- apps/web/src/hooks/useReceiptAttestation.ts apps/web/src/lib/runtime-attestation-status.ts`
> On mismatch, re-read live excerpts → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/014-host-attestation-trust-model.md
- **Category**: correctness
- **Planned at**: commit `4ed256f`, 2026-06-21

## Why this matters

Plan 014 split host attestation trust into `teeVerified` (quote validated) and
`runtimeSigned` (MNEMONIC envelope present). The public API sets legacy `verified`
to `teeVerified` only. Receipt page logic still gates "host verified" on
`data.verified`, so MNEMONIC-only hosts show `runtimeSigned: true` but receipt
UI stays `pending` — inconsistent with `HostTeeTrustStrip` and
`deriveHostAttestationStatus`.

## Current state

Receipt hook (wrong gate):

```typescript
// apps/web/src/hooks/useReceiptAttestation.ts:28-30
const tee = hostAttestation.data?.teeAttestation;
const signedRuntime = hostAttestation.data?.signedRuntime;
const hostVerified = Boolean(hostAttestation.data?.verified && (tee?.valid || signedRuntime));
```

API trust model:

- `apps/api/src/routes/host-attestation.ts:170-177` — `verified: teeVerified`;
  `runtimeSigned` set independently when MNEMONIC signs runtime
- `apps/api/src/host-attestation.test.ts:74-76` — asserts MNEMONIC-only path:
  `runtimeSigned: true`, `verified: false`

Aligned web helper:

- `apps/web/src/lib/runtime-attestation-status.ts` — uses `teeVerified` and
  `runtimeSigned` (read this file; match its predicate)

## Commands you will need

| Purpose   | Command                             | Expected on success |
| --------- | ----------------------------------- | ------------------- |
| Web tests | `pnpm --filter @bossraid/web test`  | all pass            |
| Typecheck | `pnpm --filter @bossraid/web check` | exit 0              |

## Scope

**In scope**:

- `apps/web/src/hooks/useReceiptAttestation.ts`
- `apps/web/src/lib/runtime-attestation-status.test.ts` (create if absent) or
  extend existing receipt-related test file

**Out of scope**:

- API response shape changes
- `HostTeeTrustStrip` (already aligned)
- Attestation inspector sidebar

## Git workflow

- Branch: `advisor/024-align-receipt-host-verified-trust`
- Commit example: `fix(web): receipt host verified uses teeVerified and runtimeSigned`
- Do NOT push unless instructed

## Steps

### Step 1: Read aligned predicate

Open `apps/web/src/lib/runtime-attestation-status.ts` and identify the function
that maps `HostAttestationResponse` → status label (e.g. `deriveHostAttestationStatus`).

Reuse the same boolean for `hostVerified` instead of duplicating logic.

### Step 2: Fix useReceiptAttestation

Replace `hostVerified` computation with trust-model alignment:

```typescript
const teeVerified = hostAttestation.data?.teeVerified ?? hostAttestation.data?.verified;
const runtimeSigned = Boolean(hostAttestation.data?.signedRuntime);
const hostVerified = Boolean((teeVerified && tee?.valid) || runtimeSigned);
```

Or delegate to shared helper exported from `runtime-attestation-status.ts`.

Update `runtimeAttestationStatus` branches if they assume old `verified` gate.

**Verify**: `pnpm --filter @bossraid/web check` → exit 0.

### Step 3: Add regression test

Add a unit test (new file or `apps/web/src/lib/receipt-url.test.ts` sibling):

- Input: `{ teeVerified: false, verified: false, signedRuntime: {...}, teeAttestation: { valid: false } }`
- Expect: `hostVerified === true` (or `runtimeAttestationStatus === 'live'`)

Model after existing web test style (`node:test` + `assert`).

**Verify**: `pnpm --filter @bossraid/web test` → all pass including new test.

## Test plan

- One test: MNEMONIC-only host (`runtimeSigned`, not `teeVerified`) → host verified live
- One test: `teeVerified` + valid tee → host verified live
- One test: neither → pending/unavailable

## Done criteria

- [ ] `useReceiptAttestation` does not require `data.verified` for MNEMONIC-only hosts
- [ ] New unit test covers MNEMONIC-only path
- [ ] `pnpm --filter @bossraid/web test` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

- `runtime-attestation-status.ts` uses different semantics than described — STOP with excerpt.
- Receipt components outside scope need API changes — STOP.

## Maintenance notes

- When adding new consumers of `HostAttestationResponse`, use `teeVerified` /
  `runtimeSigned`; treat `verified` as legacy alias for `teeVerified` only.
