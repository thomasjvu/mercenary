# Plan 037: Unify marketplace TEE trust badges

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e204b19..HEAD -- apps/web/src/components/marketplace/ apps/web/src/components/raiders/RaiderRow.tsx apps/web/src/components/trust/UpstreamTeeVerificationPanel.tsx`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (extends plan 031 SellerOrderBook fix)
- **Category**: security
- **Planned at**: commit `e204b19`, 2026-06-21

## Why this matters

Plan 031 changed `SellerOrderBook` to show **"tee claimed"** for profile/catalog
`teeAttested` flags. Other marketplace surfaces still render unqualified `tee` or
`TEE attested` from self-asserted catalog metadata (`inference-marketplace.ts`
exposes `provider.privacy?.teeAttested`). Users can misread seller self-assertions
as host-verified proof. Verified state must come only from live
`verifyMarketplaceTeeAttestation` / `lastAttestation.valid`.

## Current state

Plan 031 exemplar — `apps/web/src/components/marketplace/SellerOrderBook.tsx:118-119`:

```tsx
<span className="trust-badge trust-badge--tee">tee claimed</span>
```

Still using implied verification:

- `apps/web/src/components/marketplace/FeaturedModels.tsx:90-91` — `tee` badge
- `apps/web/src/components/marketplace/ModelCatalog.tsx` — similar
- `apps/web/src/components/marketplace/InferencePlayground.tsx` — TEE copy
- `apps/web/src/components/raiders/RaiderRow.tsx:83-84` — `TEE attested`
- `apps/web/src/components/trust/UpstreamTeeVerificationPanel.tsx:60` — profile-based

Trust badge styling: `trust-badge trust-badge--tee` (RX-78 design system).

## Commands you will need

| Purpose   | Command                            | Expected on success |
| --------- | ---------------------------------- | ------------------- |
| Typecheck | `pnpm check`                       | exit 0              |
| Web tests | `pnpm --filter @bossraid/web test` | all pass            |
| Lint      | `pnpm lint`                        | exit 0              |

## Scope

**In scope**:

- `apps/web/src/components/trust/TeeTrustBadge.tsx` (create shared component)
- `apps/web/src/components/marketplace/FeaturedModels.tsx`
- `apps/web/src/components/marketplace/ModelCatalog.tsx`
- `apps/web/src/components/marketplace/InferencePlayground.tsx` (badge/copy only)
- `apps/web/src/components/raiders/RaiderRow.tsx`
- `apps/web/src/components/trust/UpstreamTeeVerificationPanel.tsx`
- `apps/web/src/lib/tee-trust-badge.test.ts` (create) — label mapping tests

**Out of scope**:

- API changes to `teeAttested` source fields
- Attestation inspector cached verify labeling (separate finding)
- Server-side provider registry enforcement
- `SellerOrderBook.tsx` (already correct — migrate to shared component)

## Git workflow

- Branch: `advisor/037-unify-marketplace-tee-trust-badges`
- Commit example: `fix(web): show tee claimed vs verified consistently in marketplace`
- Do NOT push unless instructed

## Steps

### Step 1: Create shared TeeTrustBadge component

Create `apps/web/src/components/trust/TeeTrustBadge.tsx`:

```tsx
type TeeTrustLevel = 'none' | 'claimed' | 'verified' | 'failed';

export function resolveTeeTrustLevel(input: {
  catalogTeeAttested?: boolean;
  liveVerifyValid?: boolean | null;
}): TeeTrustLevel { ... }

export function TeeTrustBadge(props: { level: TeeTrustLevel; className?: string }) { ... }
```

Rules:

- `liveVerifyValid === true` → label **"tee verified"**, class `trust-badge--tee` (ready tone)
- `liveVerifyValid === false` → **"tee failed"** or muted failure variant
- `catalogTeeAttested` / profile flag only → **"tee claimed"** (match SellerOrderBook)
- `none` → render null

Export `resolveTeeTrustLevel` for unit tests.

**Verify**: `pnpm --filter @bossraid/web check` → exit 0.

### Step 2: Replace inline badges in marketplace components

For each file in scope:

- Replace raw `<span className="trust-badge trust-badge--tee">tee</span>` with
  `<TeeTrustBadge level={resolveTeeTrustLevel({ catalogTeeAttested: ... })} />`.
- Where a component already has `lastAttestation` from verify API, pass
  `liveVerifyValid: lastAttestation?.valid`.
- `RaiderRow`: change `TEE attested` to claimed unless live verify present.
- `UpstreamTeeVerificationPanel`: distinguish profile claim vs panel verify result.

Refactor `SellerOrderBook` to use the shared component (optional but preferred).

**Verify**:

```bash
rg "TEE attested|trust-badge--tee\">tee<" apps/web/src/components
```

→ no unqualified `tee` or `TEE attested` from catalog-only paths.

### Step 3: Add unit tests

`apps/web/src/lib/tee-trust-badge.test.ts` (or colocate with component):

- catalog only → `claimed`
- live valid → `verified`
- live invalid → `failed`
- neither → `none`

**Verify**: `pnpm --filter @bossraid/web test` → pass.

### Step 4: Full verification

```bash
pnpm check
pnpm lint
pnpm --filter @bossraid/web test
```

## Test plan

- Pure function tests for `resolveTeeTrustLevel`.
- No visual snapshot tests required.

## Done criteria

- [ ] Shared `TeeTrustBadge` used across marketplace + raider surfaces listed
- [ ] Catalog/profile flags never render as "tee verified" without live verify
- [ ] SellerOrderBook uses shared component or matches its copy exactly
- [ ] `pnpm check` and web tests pass
- [ ] `plans/README.md` status row updated

## STOP conditions

- A surface requires live verify on every render (perf concern) — use claimed +
  optional cached `lastAttestation` only; do not add blocking POST per row.
- RX-78 badge classes differ per surface — match existing `trust-badge` patterns
  from `SellerOrderBook`; do not invent new color tokens.

## Maintenance notes

- New marketplace TEE UI must use `TeeTrustBadge`; "verified" requires API verify.
- Plan 033 gates playground inference; this plan fixes static catalog copy.
- Partially addresses deferred finding 169 (profile features) for TEE label only.
