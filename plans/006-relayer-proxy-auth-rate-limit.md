# Plan 006: Rate-limit and gate relayer proxy routes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/routes/relayer.ts apps/api/src/handlers/auth`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-relayer-webhook-auth.md
- **Category**: security
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

`POST /v1/relayer/send`, `/estimate`, `/fee-data` and `GET /v1/relayer/status/:taskId` have no rate limits or session checks. Unauthenticated callers can drive outbound traffic to the 1Shot relayer and fill the local task cache.

## Current state

- `apps/api/src/routes/relayer.ts:17-88` — unauthenticated proxy routes.
- Raid handlers apply `requireRateLimit` + `requireMercenaryAccess` (`apps/api/src/handlers/raid.ts:171-182`).
- Rate limit helper: `apps/api/src/handlers/auth/rate-limits.ts`.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
| --------- | ---------------------------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test -- relayer-routes` | exit 0              |
| Typecheck | `pnpm check`                                         | exit 0              |

## Scope

**In scope**:

- `apps/api/src/routes/relayer.ts`
- `apps/api/src/relayer-routes.test.ts` (extend from plan 005)

**Out of scope**:

- Webhook auth (plan 005)
- Mercenary access policy changes in `mercenary-access.ts`

## Git workflow

- Branch: `advisor/006-relayer-proxy-auth-rate-limit`
- Commits: `fix(api): rate-limit and gate relayer proxy routes`
- Do NOT push unless instructed.

## Steps

### Step 1: Wire auth handlers into relayer routes

Change `registerRelayerRoutes` signature to accept `AuthHandlers` (or specific `requireRateLimit` + session helpers) the same way raid/chat routes do. Inspect how `apps/api/src/index.ts` registers routes for the pattern.

### Step 2: Apply rate limits

On all `/v1/relayer/*` routes:

1. Call `requireRateLimit(request, reply, 'relayer', publicRateLimitMax, publicRateLimitWindowMs)` — use same limits as raid routes from ctx/env.
2. Return early on 429.

### Step 3: Require session on mutating routes

On `POST /v1/relayer/send`:

1. Require `requireMercenaryAccess` (wallet session or API key) — same as raid spawn.
2. Keep `GET /capabilities`, `GET /status` read-only but rate-limited.

`POST /estimate` and `POST /fee-data`: require session OR rate-limit aggressively (match `/send` if they trigger relayer load).

**Verify**: `pnpm --filter @bossraid/api test -- relayer-routes` → exit 0

### Step 4: Extend tests

Add tests:

- `/v1/relayer/send` without session → 401
- `/v1/relayer/send` with valid session → 200 (mock relayer if needed)
- Exceeding rate limit → 429

**Verify**: `pnpm --filter @bossraid/api test -- relayer-routes` → all pass

## Test plan

- Auth + rate limit cases on relayer routes.
- Use `createPublicSessionCookie` or equivalent from `apps/api/src/test/helpers.js`.

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm --filter @bossraid/api test` exits 0
- [ ] `POST /v1/relayer/send` requires mercenary access
- [ ] All relayer routes rate-limited
- [ ] `plans/README.md` updated

## STOP conditions

- Mercenary web flow requires unauthenticated `/send` — report product conflict before weakening auth.
- Route registration refactor in `index.ts` is larger than expected — report scope.

## Maintenance notes

- New relayer endpoints must copy the same guards.
- Reviewers: confirm agent flows using relayer still work with wallet session.
