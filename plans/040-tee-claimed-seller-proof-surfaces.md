# Plan 040: Extend tee claimed copy to seller and proof-ui

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 783eadf..HEAD -- apps/web/src/components/seller/ModelPickerModal.tsx packages/proof-ui/src/routing.ts`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 037 (marketplace badges)
- **Category**: security
- **Planned at**: commit `783eadf`, 2026-06-21

## Why this matters

Plan 037 unified marketplace TEE badges to **tee claimed** vs **tee verified**.
Two surfaces still imply verification from catalog/profile flags only:

- Seller `ModelPickerModal` shows raw `tee` badge (`ModelPickerModal.tsx:88-90`)
- `proof-ui` routing summaries emit `tee attested` from `provider.privacy.teeAttested`
  (`packages/proof-ui/src/routing.ts:88-90`, `:122`)

Sellers and receipt/routing proof consumers can misread self-asserted flags as verified TEE.

## Current state

Exemplar (plan 037): `apps/web/src/components/trust/TeeTrustBadge.tsx` and
`apps/web/src/lib/tee-trust-badge.ts`.

Gaps:

```tsx
// ModelPickerModal.tsx ~88-90
{
  model.teeAttested ? <span className="trust-badge trust-badge--tee">tee</span> : null;
}
```

```typescript
// proof-ui/routing.ts ~122
privacyFeatures.has('tee_attested') ? 'tee attested' : null,
```

`packages/proof-ui/src/routing.test.ts` exists but does not assert privacy label copy.

## Commands you will need

| Purpose        | Command                                 | Expected on success |
| -------------- | --------------------------------------- | ------------------- |
| Web tests      | `pnpm --filter @bossraid/web test`      | all pass            |
| Proof-ui tests | `pnpm --filter @bossraid/proof-ui test` | all pass            |
| Typecheck      | `pnpm check`                            | exit 0              |

## Scope

**In scope**:

- `apps/web/src/components/seller/ModelPickerModal.tsx`
- `packages/proof-ui/src/routing.ts`
- `packages/proof-ui/src/routing.test.ts`

**Out of scope**:

- `marketplace-trust.ts` filters (deferred SECURITY-04)
- Server-side privacy scoring (`provider-registry`)
- `ModelPickerModal` unrelated layout

## Git workflow

- Branch: `advisor/040-tee-claimed-seller-proof-surfaces`
- Commit example: `fix(web,proof-ui): label profile tee flags as claimed`
- Do NOT push unless instructed

## Steps

### Step 1: ModelPickerModal uses TeeTrustBadge

Import `TeeTrustBadge` and `resolveTeeTrustLevel` from plan 037 modules.
Replace inline `tee` span with:

```tsx
<TeeTrustBadge level={resolveTeeTrustLevel({ catalogTeeAttested: model.teeAttested })} />
```

**Verify**: `rg 'trust-badge--tee">tee<' apps/web/src/components/seller` → no matches.

### Step 2: proof-ui routing copy

In `buildRoutingProofNote` (or equivalent builder at `routing.ts:122`):

- Change profile-derived `tee_attested` label from `tee attested` to `tee claimed`.
- If `decision.privacyFeatures` includes server-verified keys (e.g. from
  `featuresVerified`), optionally emit `tee verified` — only when evidence exists
  in the decision object; do not invent verify state.

Keep internal feature key `tee_attested` in the Set; only change display string.

**Verify**: `rg "'tee attested'" packages/proof-ui/src` → no user-facing profile-only labels.

### Step 3: Add proof-ui test

In `routing.test.ts`, add a case with `provider.privacy.teeAttested: true` and
assert summary contains `tee claimed` and not `tee attested`.

**Verify**:

```bash
pnpm --filter @bossraid/proof-ui test
pnpm --filter @bossraid/web test
pnpm check
```

## Test plan

- proof-ui: profile tee → `tee claimed` in summary string.
- web: existing `tee-trust-badge.test.ts` covers component; ModelPicker needs no snapshot test.

## Done criteria

- [ ] ModelPickerModal uses `TeeTrustBadge`
- [ ] proof-ui routing shows `tee claimed` for profile flags
- [ ] `pnpm check` and package tests pass
- [ ] `plans/README.md` status row updated

## STOP conditions

- proof-ui cannot import web components — duplicate label string only in proof-ui; do not cross-import apps/web.
- Routing decisions already carry verified TEE elsewhere — preserve that path; only change profile fallback label.

## Maintenance notes

- New seller/marketplace TEE UI must use `TeeTrustBadge` or `tee claimed` copy.
- proof-ui is consumed by receipts and MCP — keep labels consistent with plan 037.
