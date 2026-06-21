# Plan 023: Fix chat integration test settlement harness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4ed256f..HEAD -- apps/api/src/chat-budget.test.ts apps/api/src/test/helpers.ts apps/api/src/lib/chat-terminal-wait.ts`
> On mismatch, re-read live files before proceeding → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (benefits from plan 022 but not blocked)
- **Category**: tests
- **Planned at**: commit `4ed256f`, 2026-06-21

## Why this matters

Buffered chat completion tests spin up a real `BossRaidOrchestrator` with the
default settlement executor (noop) while `BOSSRAID_SETTLEMENT_MODE` defaults to
`file`. `pollForTerminalChatOutcome` in file mode requires `settlementExecution`
on the raid result; without it the waiter throws `ChatTerminalWaitError` and
the API returns 500 even when the raid reached `final`.

This causes flaky, slow chat-budget and chat-completion integration tests (~17
failures observed in full API suite runs).

## Current state

Settlement default and terminal wait:

- `packages/constants/src/settlement.ts` — default `BOSSRAID_SETTLEMENT_MODE` is `'file'`
- `apps/api/src/lib/chat-terminal-wait.ts:88-97` — file mode requires settlement execution
- `apps/orchestrator/src/orchestrator-settlement-runner.ts:115-122` — noop executor yields no record

Broken harness (bypasses test helper):

- `apps/api/src/chat-budget.test.ts:67-79` — builds orchestrator directly, calls
  `buildApiServer(orchestrator, env)` without `BOSSRAID_SETTLEMENT_MODE: 'off'`

Working harness pattern:

- `apps/api/src/test/helpers.ts:268` — `createTestApiServer` sets
  `BOSSRAID_SETTLEMENT_MODE: env.BOSSRAID_SETTLEMENT_MODE ?? 'off'`

First test in same file already uses the helper correctly (`chat-budget.test.ts:15`).

Similar risk in `apps/api/src/chat-completion.test.ts` — audit for raw `buildApiServer`
without settlement-off or `createTestApiServer`.

## Commands you will need

| Purpose               | Command                                                               | Expected on success |
| --------------------- | --------------------------------------------------------------------- | ------------------- |
| Chat budget tests     | `cd apps/api && node --import tsx --test src/chat-budget.test.ts`     | all pass, <30s      |
| Chat completion tests | `cd apps/api && node --import tsx --test src/chat-completion.test.ts` | all pass            |
| Typecheck             | `pnpm check`                                                          | exit 0              |

## Scope

**In scope**:

- `apps/api/src/chat-budget.test.ts`
- `apps/api/src/chat-completion.test.ts` (only if same harness issue found)
- Optional: extract `createMercenaryChatTestServer()` in `apps/api/src/test/helpers.ts`
  if it deduplicates two+ call sites

**Out of scope**:

- Changing production settlement behavior
- Rewriting `chat-terminal-wait.ts` production logic
- Fixing unrelated API test failures outside chat suites

## Git workflow

- Branch: `advisor/023-fix-chat-test-settlement-harness`
- Commit example: `fix(api): disable file settlement in chat integration tests`
- Do NOT push unless instructed

## Steps

### Step 1: Fix chat-budget default-budget test harness

In `apps/api/src/chat-budget.test.ts`, replace the second test's server setup
with either:

**Option A** — use `createTestApiServer`:

```typescript
const app = createTestApiServer([provider], {
  BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST: '15',
});
```

**Option B** — pass settlement off explicitly:

```typescript
buildApiServer(orchestrator, {
  ...process.env,
  BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST: '15',
  BOSSRAID_SETTLEMENT_MODE: 'off',
});
```

Prefer Option A to match the first test and `helpers.ts` conventions.

**Verify**:

```bash
cd apps/api && node --import tsx --test src/chat-budget.test.ts
```

→ 2/2 pass, total duration under 30 seconds.

### Step 2: Audit chat-completion.test.ts

```bash
rg "buildApiServer|BossRaidOrchestrator" apps/api/src/chat-completion.test.ts
```

For each integration test using raw `buildApiServer` without settlement-off,
apply the same fix. Also set `FAST_TEST_TIMING` if helpers support it.

**Verify**:

```bash
cd apps/api && node --import tsx --test src/chat-completion.test.ts
```

→ all pass.

### Step 3: Optional helper extraction

If two or more chat test files duplicate provider + server wiring, add
`createMercenaryChatTestServer(providers, env?)` to `test/helpers.ts` that
wraps `createTestApiServer` with chat-friendly defaults
(`BOSSRAID_SETTLEMENT_MODE: 'off'`, `FAST_TEST_TIMING: '1'` if applicable).

**Verify**: `pnpm check` exits 0.

## Test plan

- Existing tests are the regression suite; no new tests required unless a
  one-liner unit test for "file mode + noop executor → terminal wait error"
  is trivial in `chat-terminal-wait.test.ts` (optional, out of scope unless quick).

## Done criteria

- [ ] `src/chat-budget.test.ts` — all tests pass quickly (<30s total)
- [ ] `src/chat-completion.test.ts` — all tests pass
- [ ] No chat integration test calls `buildApiServer` without `BOSSRAID_SETTLEMENT_MODE: 'off'` or `createTestApiServer`
- [ ] `pnpm check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Tests still fail with `ChatTerminalWaitError` after settlement-off — inspect
  `chat-terminal-wait.ts` for additional gates; STOP with raid status payload.
- Fixing chat-completion requires touching production chat pipeline — STOP.
- Test duration still exceeds 60s per file — report for separate perf plan (TESTS-048).

## Maintenance notes

- New chat integration tests must use `createTestApiServer` or explicitly set
  `BOSSRAID_SETTLEMENT_MODE: 'off'`.
- Production file settlement behavior is unchanged; this is test-harness only.
