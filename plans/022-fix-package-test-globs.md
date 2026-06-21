# Plan 022: Fix unquoted package test globs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4ed256f..HEAD -- packages/privacy-engine/package.json apps/orchestrator/package.json`
> On mismatch in test script lines, compare excerpts before proceeding → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `4ed256f`, 2026-06-21

## Why this matters

Several workspace packages use an **unquoted** shell glob in their `test`
script (`src/**/*.test.ts`). When npm/pnpm invokes the script through a shell,
the glob expands **before** Node runs, often matching only files in the package
root — not nested `src/` trees. Turbo then reports green while attestation,
orchestrator settlement, and privacy-verify tests never execute.

This is a verification-baseline fix: other attestation and money-path plans
cannot be trusted until package tests actually run.

## Current state

Working pattern (quoted glob — Node resolves recursively):

- `apps/api/package.json:18` — `"test": "node --import tsx --test 'src/**/*.test.ts'"`
- `apps/web/package.json:10` — same

Broken pattern (unquoted — shell expansion):

- `packages/privacy-engine/package.json:21` — only ~3 tests run; misses
  `attestation.test.ts`, `verify-submission-attestation.test.ts`, `index.test.ts`
- `apps/orchestrator/package.json:23` — 22 `*.test.ts` files under `src/` but
  turbo logs show ~5 tests (partition suite only)

Other packages with the same unquoted pattern (fix all in this plan):

```bash
rg '"test": "node --import tsx --test src/\*\*/\*\.test\.ts"' --glob package.json
```

Expected hits include: `apps/orchestrator`, `packages/privacy-engine`,
`apps/ops`, `apps/provider-agent`, `apps/mcp-server`, `apps/evaluator`,
`packages/smart-pay`, `packages/proof-ui`, `packages/provider-sdk`,
`packages/contracts`, `packages/api-contracts`, `packages/scoring`,
`packages/evaluation`, `packages/persistence-sqlite`.

## Commands you will need

| Purpose            | Command                                       | Expected on success |
| ------------------ | --------------------------------------------- | ------------------- |
| Privacy tests      | `pnpm --filter @bossraid/privacy-engine test` | ≥7 tests pass       |
| Orchestrator tests | `pnpm --filter @bossraid/orchestrator test`   | ≫5 tests pass       |
| Unit sweep         | `pnpm test:unit`                              | exit 0              |
| Typecheck          | `pnpm check`                                  | exit 0              |

## Scope

**In scope**:

- Every `package.json` whose `test` script uses unquoted `src/**/*.test.ts`
  (see grep above)

**Out of scope**:

- Rewriting failing tests surfaced after glob fix (file follow-up issues)
- Changing test frameworks or turbo pipeline structure

## Git workflow

- Branch: `advisor/022-fix-package-test-globs`
- Commit example: `fix(tests): quote package test globs for nested discovery`
- Do NOT push unless instructed

## Steps

### Step 1: Inventory broken scripts

```bash
rg '"test": "node --import tsx --test src/\*\*/\*\.test\.ts"' --glob package.json -l
```

Record every path; all must be updated.

**Verify**: list is non-empty and includes `packages/privacy-engine/package.json`.

### Step 2: Quote globs in every listed package.json

Replace:

```json
"test": "node --import tsx --test src/**/*.test.ts"
```

With:

```json
"test": "node --import tsx --test 'src/**/*.test.ts'"
```

Match quoting style of `apps/api/package.json` (single quotes inside JSON string).

**Verify**: `rg '"test": "node --import tsx --test src/\*\*/\*\.test\.ts"' --glob package.json` → no matches.

### Step 3: Run privacy-engine and orchestrator tests

```bash
pnpm --filter @bossraid/privacy-engine test
pnpm --filter @bossraid/orchestrator test
```

**Verify**: privacy-engine reports ≥7 tests; orchestrator reports ≫5 tests
(including `raid-provider-dispatch.test.ts` and settlement tests).

### Step 4: Run monorepo unit sweep

```bash
pnpm test:unit
```

**Verify**: exit 0. If new failures appear, they are real regressions — fix only
if trivially caused by this change (e.g. import path); otherwise STOP and report.

## Test plan

- No new test files required.
- Regression signal: test counts increase for privacy-engine and orchestrator
  without changing test source files.

## Done criteria

- [ ] No unquoted `src/**/*.test.ts` test scripts remain in workspace `package.json` files
- [ ] `pnpm --filter @bossraid/privacy-engine test` runs ≥7 tests, all pass
- [ ] `pnpm --filter @bossraid/orchestrator test` runs ≫5 tests, all pass
- [ ] `pnpm test:unit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Grep in step 1 returns zero files (glob issue may already be fixed) — report and skip.
- `pnpm test:unit` fails with failures unrelated to glob quoting after step 4 — STOP with failure list; do not weaken tests.
- A package uses a different test runner pattern — update only `node --import tsx --test` scripts.

## Maintenance notes

- When adding new workspace packages, copy the **quoted** glob from `apps/api`.
- Consider a root lint script that fails on unquoted `src/**/*.test.ts` in future.
