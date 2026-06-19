# Plan 005: Authenticate relayer webhook

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/routes/relayer.ts .env.example content/docs/reference/env.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

`POST /v1/relayer/webhook` accepts arbitrary JSON and updates relayer task status in control state with no authentication. Any client can forge completion/failure for known `taskId` values, corrupting agent/UI state.

## Current state

- `apps/api/src/routes/relayer.ts:90-125` — unauthenticated webhook handler.
- Auth patterns: `safeEqualString` in `apps/api/src/lib/http.js`; bearer checks in `apps/api/src/handlers/billing-mana.ts:35`.

## Commands you will need

| Purpose   | Command                            | Expected on success |
| --------- | ---------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test` | exit 0              |
| Typecheck | `pnpm check`                       | exit 0              |

## Scope

**In scope**:

- `apps/api/src/routes/relayer.ts`
- `apps/api/src/relayer-routes.test.ts` (create)
- `.env.example` — add `BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET` placeholder
- `content/docs/reference/env.md` — document new env var (required per AGENTS.md for env changes)

**Out of scope**:

- 1Shot relayer package internals
- Other relayer routes (plan 006)

## Git workflow

- Branch: `advisor/005-relayer-webhook-auth`
- Commits: `fix(api): authenticate 1Shot relayer webhook`
- Do NOT push unless instructed.

## Steps

### Step 1: Add webhook secret env var

1. Add `BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET` to `.env.example` with empty/placeholder value and comment.
2. Document in `content/docs/reference/env.md` under relayer section.

**Verify**: `grep BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET .env.example` → match found

### Step 2: Require shared secret on webhook

In `registerRelayerRoutes`:

1. Read secret from `ctx.env.BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET`.
2. In non-production dev: if secret unset, log warning once and allow webhook (document escape hatch) OR require secret always — **prefer require in production, optional in dev with explicit `BOSSRAID_ALLOW_UNAUTHENTICATED_RELAYER_WEBHOOK=true` dev flag** to avoid breaking local stacks.
3. Validate incoming request via header `X-BossRaid-Relayer-Webhook-Secret` (or `Authorization: Bearer <secret>`) using `safeEqualString`.
4. Return 401 when secret missing or mismatch.

**Verify**: `pnpm check` → exit 0

### Step 3: Add route tests

Create `apps/api/src/relayer-routes.test.ts` using `buildApiServer` + `app.inject` pattern from other route tests:

- Webhook without secret → 401 (when secret configured in test env)
- Webhook with correct secret → 200, task updated
- Webhook with wrong secret → 401

**Verify**: `pnpm --filter @bossraid/api test -- relayer-routes` → all pass

## Test plan

- 3 cases: missing, wrong, correct secret.
- Pattern: `apps/api/src/bounty-routes.test.ts` inject style.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/api test` exits 0
- [ ] Unauthenticated webhook returns 401 when secret is configured
- [ ] Env var documented in `.env.example` and `content/docs/reference/env.md`
- [ ] No secret values in committed files
- [ ] `plans/README.md` updated

## STOP conditions

- 1Shot documents a different signature scheme (HMAC body) — implement per their spec instead of shared secret; report.
- Production deployment has no way to inject secret — report ops blocker.

## Maintenance notes

- Coordinate with operators to set webhook secret in Infisical/Phala env before enabling in production.
- Plan 006 reuses auth patterns from this file.
