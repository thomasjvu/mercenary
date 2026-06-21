# Plan 013: Add attestation characterization tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat fcbeaf9..HEAD -- apps/api/src/host-attestation.test.ts packages/privacy-engine/src/attestation.ts apps/api/src/routes/host-attestation.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `fcbeaf9`, 2026-06-20

## Why this matters

The public host attestation route (`GET /v1/host/attestation`) and the
`privacy-engine` Phala quote path were heavily changed in the eighth deploy
arc (dstack socket, structural vs cloud verify, cache warmup). Today only two
smoke tests exist on the host route, and `packages/privacy-engine/src/attestation.ts`
has no unit tests. Without characterization tests, trust-model fixes (Plan 014)
and server-side re-verification (Plan 015) can regress silently.

## Current state

- `apps/api/src/host-attestation.test.ts` — two tests only:
  - MNEMONIC-only EigenCompute path returns `verified: true` with `signedRuntime`
  - Phala missing socket returns 503
- `apps/api/src/routes/host-attestation.ts` — public route; sets
  `skipCloudVerify: true`, module cache, warmup; `verified` is
  `Boolean(teeAttestation?.valid || signedRuntime)` at line 168
- `packages/privacy-engine/src/attestation.ts` — `verifyPhalaTeeAttestation`,
  `callPhalaAttestationApi`, cache keyed by `result.signature` (not `valid`)
- `packages/privacy-engine/src/upstream-tee/quote-verify.test.ts` — cloud verify
  unit tests exist but are not wired to host route
- `apps/api/src/marketplace-tee.test.ts` — single mock-mode POST test; use as
  API test pattern (`createTestApiServer` + `app.inject`)

Repo conventions:

- API tests: Node built-in test runner with `node --import tsx --test`
- Pattern: `createTestApiServer` from `apps/api/src/test/helpers.js`
- Commit style: conventional commits (e.g. `test(api): ...`)

## Commands you will need

| Purpose       | Command                                                                          | Expected on success |
| ------------- | -------------------------------------------------------------------------------- | ------------------- |
| Typecheck     | `pnpm check`                                                                     | exit 0              |
| Host tests    | `cd apps/api && node --import tsx --test src/host-attestation.test.ts`           | all pass            |
| Privacy tests | `cd packages/privacy-engine && node --import tsx --test src/attestation.test.ts` | all pass            |
| Lint          | `pnpm lint`                                                                      | exit 0              |

## Scope

**In scope**:

- `apps/api/src/host-attestation.test.ts`
- `packages/privacy-engine/src/attestation.test.ts` (create)
- `apps/api/src/routes/host-attestation.ts` (only if minimal test hooks needed —
  prefer env/mocking over production code changes)

**Out of scope**:

- Changing `verified` semantics or cloud-verify behavior (Plan 014)
- Orchestrator submit-path re-verification (Plan 015)
- Web component tests
- Documentation updates (Plan 016)

## Git workflow

- Branch: `advisor/013-attestation-characterization-tests`
- Commit message example: `test(api): characterize host attestation route responses`
- Do NOT push or open a PR unless instructed

## Steps

### Step 1: Add privacy-engine attestation unit tests

Create `packages/privacy-engine/src/attestation.test.ts` with tests that do
**not** call real dstack sockets. Options:

1. Export test-only helpers if needed, **or**
2. Mock at module boundary by testing pure functions already exported:
   `buildSignedDeclaration`, `buildPrivacyAttestation` from `attestation.ts`

Minimum cases:

- `buildSignedDeclaration` output format is stable for fixed inputs
- Document current cache behavior: when documenting via integration-style test
  with injected mock `callPhalaAttestationApi` is not available, add a comment
  test that reads `attestation.ts` cache branch at lines 89-91 and asserts
  the intended **current** behavior (caches when `signature` present) so Plan
  014 can flip the assertion intentionally

If you can test `verifyPhalaTeeAttestation` in-flight dedupe without sockets
(e.g. by passing a custom cache Map and mocking internal RPC via env pointing
to unreachable path + short timeout), add one test proving concurrent calls
share one promise.

**Verify**: `cd packages/privacy-engine && node --import tsx --test src/attestation.test.ts` → all pass

### Step 2: Extend host-attestation route tests

Add cases to `apps/api/src/host-attestation.test.ts`:

1. **Phala success mock** — if direct Phala RPC is hard to mock, stub at route
   level by temporarily setting env so socket check passes but verification
   returns via test double. Acceptable approach: add optional
   `BOSSRAID_HOST_ATTESTATION_TEST_FIXTURE=1` only in test env that returns a
   fixed `teeAttestation` — **only if** no cleaner mock exists. Prefer testing
   response shape with MNEMONIC + Phala platform both configured.

2. **verified when only signedRuntime** — assert current behavior:
   `verified: true` when `signedRuntime` present and `teeAttestation` absent
   (documents SEC-004 baseline before Plan 014 changes it).

3. **Rate limit** — two rapid requests should not 500; optional if helper
   exposes rate limit bucket (skip if too invasive).

Model after `apps/api/src/marketplace-tee.test.ts` inject pattern.

**Verify**: `cd apps/api && node --import tsx --test src/host-attestation.test.ts` → ≥4 tests pass

### Step 3: Run full verification gates

**Verify**: `pnpm check` → exit 0

**Verify**: `pnpm lint` → exit 0

## Test plan

- New `packages/privacy-engine/src/attestation.test.ts` — declaration builder +
  documented cache semantics
- Extended `apps/api/src/host-attestation.test.ts` — MNEMONIC+Phala matrix,
  `verified` flag baseline
- Pattern: `apps/api/src/marketplace-tee.test.ts`

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `host-attestation.test.ts` has ≥4 passing tests
- [ ] `attestation.test.ts` exists and passes
- [ ] No production behavior changes unless minimal test-only env gate added
- [ ] `plans/README.md` status row for 013 updated to DONE

## STOP conditions

- In-scope source no longer matches excerpts (drift since `fcbeaf9`).
- Mocking Phala RPC requires large refactors outside scope — report back with
  proposed smaller test surface instead of improvising architecture changes.
- A step's verification fails twice after reasonable fix attempt.

## Maintenance notes

- Plan 014 will change `verified` semantics and cache rules — update tests in
  014, not here, except baseline assertions added in Step 2.
- Reviewer should confirm no real dstack/socket calls in unit tests (no network
  in CI).
