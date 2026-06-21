# Plan 041: Route remaining API tests through settlement-off harness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 783eadf..HEAD -- apps/api/src/test/helpers.ts`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 023 (chat harness pattern)
- **Category**: tests
- **Planned at**: commit `783eadf`, 2026-06-21

## Why this matters

Plan 023 introduced `createTestApiServer` / `buildTestApiServer` defaulting
`BOSSRAID_SETTLEMENT_MODE` to `'off'`. Several API integration tests still call
raw `buildApiServer(orchestrator, env)` without that default. Production default
settlement mode is `'file'`, which can trigger terminal chat waits needing
`settlementExecution` — causing intermittent failures under `pnpm test:unit`.

## Current state

`apps/api/src/test/helpers.ts:266-283` — harness sets `BOSSRAID_SETTLEMENT_MODE ?? 'off'`.

Files still using raw `buildApiServer` (grep `buildApiServer(` in `apps/api/src/**/*.test.ts`):

- `x402-integration.test.ts` (6 sites)
- `chat-inference.test.ts` (3)
- `e2ee-chat-relay.test.ts` (3)
- `raid-detail.test.ts` (3)
- `providers-submit.test.ts` (3)
- `ops-attestation.test.ts` (2)
- `marketplace-account.test.ts` (2)
- `providers-registry.test.ts` (3)
- `raid-spawn.test.ts` (1)
- `ops-readiness.test.ts` (1) — may intentionally test production env; verify before changing

Exemplar fix (plan 023): `chat-budget.test.ts` uses `createTestApiServer`.

## Commands you will need

| Purpose    | Command                            | Expected on success |
| ---------- | ---------------------------------- | ------------------- |
| API tests  | `pnpm --filter @bossraid/api test` | all pass            |
| Unit suite | `pnpm test:unit`                   | exit 0              |
| Typecheck  | `pnpm check`                       | exit 0              |

## Scope

**In scope**:

- API test files listed above (except tests explicitly asserting file/onchain settlement)
- `apps/api/src/test/helpers.ts` — only if a shared helper reduces duplication

**Out of scope**:

- Production settlement behavior changes
- `test:money-path` allowlist expansion (deferred 183)
- Tests that intentionally set `BOSSRAID_SETTLEMENT_MODE: 'file'` or `'onchain'`

## Git workflow

- Branch: `advisor/041-api-test-settlement-off-harness`
- Commit example: `test(api): default settlement off in remaining integration tests`
- Do NOT push unless instructed

## Steps

### Step 1: Inventory and classify

```bash
rg "buildApiServer\(" apps/api/src --glob '*.test.ts' -n
```

For each match, classify:

- **Migrate** — generic integration test → use `buildTestApiServer` or `createTestApiServer`
- **Keep** — test explicitly validates settlement file/onchain paths

Document keeps in commit message.

### Step 2: Migrate tests

Replace patterns like:

```typescript
const app = wrapMercenaryTestInject(buildApiServer(orchestrator, { ...env }));
```

with:

```typescript
const app = buildTestApiServer(orchestrator, { ...env });
```

(`buildTestApiServer` already wraps mercenary inject and sets settlement off.)

For tests that build providers inline, use `createTestApiServer([provider], env)`.

Preserve test-specific env overrides (`BOSSRAID_X402_ENABLED`, etc.) — they merge atop defaults.

**Verify**: `rg "buildApiServer\(" apps/api/src --glob '*.test.ts'` → only intentional keeps remain.

### Step 3: Run suites

```bash
pnpm --filter @bossraid/api test
pnpm test:unit
pnpm check
```

## Test plan

- No new test files — behavior unchanged; harness consistency only.
- If a migrated test fails, fix env merge order; do not revert harness.

## Done criteria

- [ ] All non-settlement-specific API tests use harness helpers
- [ ] `pnpm --filter @bossraid/api test` passes
- [ ] `pnpm test:unit` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Test fails because it asserts file-mode settlement artifacts — keep raw `buildApiServer` with explicit mode; document in file comment.
- `ops-readiness.test.ts` requires production settlement env — leave unchanged with comment.

## Maintenance notes

- New API integration tests must use `createTestApiServer` / `buildTestApiServer` unless testing settlement modes explicitly.
