# Plan 034: Fix raid-core unit test discovery

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e204b19..HEAD -- packages/raid-core/package.json`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `e204b19`, 2026-06-21

## Why this matters

`@bossraid/raid-core` ships settlement lifecycle, routing, pricing, and selection
logic used by the orchestrator and API. Its `test` script runs
`node --import tsx --test` with **no file glob**, so `pnpm test:unit` / turbo can
report success while executing zero raid-core assertions. Plan 002 added
onchain lifecycle mapping tests that may be silently skipped.

## Current state

`packages/raid-core/package.json`:

```json
"test": "node --import tsx --test",
"test:all": "node --import tsx --test 'src/**/*.test.ts'"
```

Four test files exist under `packages/raid-core/src/*.test.ts`.

Other packages use quoted globs (plan 022 pattern), e.g.
`node --import tsx --test 'src/**/*.test.ts'`.

## Commands you will need

| Purpose        | Command                                  | Expected on success        |
| -------------- | ---------------------------------------- | -------------------------- |
| Raid-core test | `pnpm --filter @bossraid/raid-core test` | ≥4 tests pass              |
| Unit suite     | `pnpm test:unit`                         | exit 0; raid-core non-zero |
| Typecheck      | `pnpm check`                             | exit 0                     |

## Scope

**In scope**:

- `packages/raid-core/package.json` — fix `test` script

**Out of scope**:

- Test body changes unless failures are exposed and trivial to fix
- Other packages' test scripts

## Git workflow

- Branch: `advisor/034-fix-raid-core-test-glob`
- Commit example: `fix(raid-core): quote test glob so unit tests run in CI`
- Do NOT push unless instructed

## Steps

### Step 1: Align test script with test:all

In `packages/raid-core/package.json`, change:

```json
"test": "node --import tsx --test 'src/**/*.test.ts'"
```

Keep `test:all` identical or remove it if redundant (prefer single `test` script;
update only if nothing references `test:all` — grep first).

**Verify**:

```bash
pnpm --filter @bossraid/raid-core test
```

→ output lists tests from `settlement-lifecycle.test.ts`, `routing.test.ts`, etc.

### Step 2: Run monorepo unit suite

```bash
pnpm test:unit
pnpm check
```

**Verify**: exit 0. If raid-core tests fail, fix only legitimate regressions
in raid-core tests or source — do not revert the glob.

### Step 3: Confirm turbo wiring

```bash
pnpm turbo run test --filter=@bossraid/raid-core
```

**Verify**: non-zero test count in turbo summary.

## Test plan

- No new tests required — this plan enables existing tests to run.
- If failures appear, fix the failing test or bug; document in commit message.

## Done criteria

- [ ] `pnpm --filter @bossraid/raid-core test` runs all `src/**/*.test.ts` files
- [ ] `pnpm test:unit` exit 0
- [ ] `pnpm check` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Raid-core tests fail for reasons unrelated to glob (real bugs) — fix if S effort;
  if L effort, STOP with failure summary and do not revert glob.
- `test:all` is referenced in CI/docs and cannot be removed without updating
  those references.

## Maintenance notes

- New raid-core tests must live under `src/**/*.test.ts`.
- Matches plan 022 convention: always quote globs in package.json test scripts.
