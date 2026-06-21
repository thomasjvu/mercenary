# Plan 035: Consolidate TEE attestation API serializer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e204b19..HEAD -- apps/api/src/routes/host-attestation.ts apps/api/src/lib/serializers.ts`
> On mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e204b19`, 2026-06-21

## Why this matters

Two near-identical `serializeTeeAttestation` functions exist in the API layer.
The host-attestation route backfills `explorerUrl` via `buildQuoteExplorerUrl`;
raid/receipt serializers pass through `tee.explorerUrl` only. The same quote can
show an explorer link on `GET /v1/host/attestation` but not on raid attestation
views — inconsistent proof UX and duplicated maintenance.

## Current state

- `apps/api/src/routes/host-attestation.ts:43-60` — local serializer with
  `explorerUrl ?? buildQuoteExplorerUrl(tee.signature)`.
- `apps/api/src/lib/serializers.ts:116-132` — duplicate without fallback.
- `apps/api/src/host-attestation.test.ts` — host route tests (use as pattern).

## Commands you will need

| Purpose        | Command                                                                | Expected on success |
| -------------- | ---------------------------------------------------------------------- | ------------------- |
| Host tests     | `cd apps/api && node --import tsx --test src/host-attestation.test.ts` | all pass            |
| Attestation CI | `pnpm test:attestation`                                                | all pass            |
| Typecheck      | `pnpm check`                                                           | exit 0              |

## Scope

**In scope**:

- `apps/api/src/lib/serializers.ts` — canonical `serializeTeeAttestation` with explorer fallback
- `apps/api/src/routes/host-attestation.ts` — import shared helper, delete local copy
- `apps/api/src/host-attestation.test.ts` — add cross-path explorerUrl assertion if missing
- Optional: `apps/api/src/lib/serializers.test.ts` (create) for privacy attestation serialization

**Out of scope**:

- `packages/privacy-engine` verify logic
- Web client types (plan deferred SECURITY-03)
- Changing `TeeAttestationView` field set

## Git workflow

- Branch: `advisor/035-consolidate-tee-attestation-serializer`
- Commit example: `refactor(api): share TEE attestation serializer with explorer fallback`
- Do NOT push unless instructed

## Steps

### Step 1: Export shared serializer from serializers.ts

In `apps/api/src/lib/serializers.ts`:

1. Import `buildQuoteExplorerUrl` from the same module used by
   `host-attestation.ts` (grep `buildQuoteExplorerUrl` for import path).
2. Update `serializeTeeAttestation` to set:
   `explorerUrl: tee.explorerUrl ?? buildQuoteExplorerUrl(tee.signature)`.
3. Export the function: `export function serializeTeeAttestation(...)`.

**Verify**: `pnpm --filter @bossraid/api check` → exit 0.

### Step 2: Use shared helper in host-attestation route

In `apps/api/src/routes/host-attestation.ts`:

- Remove local `serializeTeeAttestation`.
- Import from `../lib/serializers.js`.

**Verify**:

```bash
rg "function serializeTeeAttestation" apps/api/src
```

→ single definition in `serializers.ts`.

### Step 3: Add regression test for explorerUrl on raid views

Add a test (in `host-attestation.test.ts` or new `serializers.test.ts`) that
serializes a `TeeAttestationResult` with `signature` set and `explorerUrl`
undefined — assert non-empty `explorerUrl` in output.

**Verify**:

```bash
cd apps/api && node --import tsx --test src/host-attestation.test.ts
pnpm test:attestation
```

## Test plan

- At least one test asserting explorerUrl backfill on shared serializer.
- Existing host-attestation tests must still pass.

## Done criteria

- [ ] Single `serializeTeeAttestation` in `apps/api/src/lib/serializers.ts`
- [ ] Host route imports shared helper
- [ ] `pnpm test:attestation` exit 0
- [ ] `pnpm check` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- `buildQuoteExplorerUrl` cannot be imported from serializers without circular
  dependency — extract to `apps/api/src/lib/tee-attestation-view.ts` instead; STOP
  only if that also cycles.
- Exported serializer breaks non-host callers expecting undefined explorerUrl —
  document intentional alignment; do not revert fallback.

## Maintenance notes

- All new TEE attestation API views must use the shared serializer.
- Reviewers should reject reintroducing a local copy in route files.
