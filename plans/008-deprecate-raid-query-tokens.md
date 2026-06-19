# Plan 008: Deprecate raid access tokens in query strings

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/handlers/auth/route-access.ts apps/api/src/routes/raid.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

Raid read access accepts tokens via query params `token`, `raidAccessToken`, `raid_access_token` (`route-access.ts:80-92`). URLs with tokens leak via proxy logs, browser history, and Referer headers when users follow external links.

## Current state

- `apps/api/src/handlers/auth/route-access.ts` — `readRaidAccessTokenQuery`.
- `apps/api/src/routes/raid.ts:49-56` — `agent_log.json` uses query token.
- Header auth already supported via `X-BossRaid-Raid-Access-Token` (verify in `route-access.ts`).

## Commands you will need

| Purpose   | Command                                    | Expected on success |
| --------- | ------------------------------------------ | ------------------- |
| API tests | `pnpm --filter @bossraid/api test -- raid` | exit 0              |
| Typecheck | `pnpm check`                               | exit 0              |

## Scope

**In scope**:

- `apps/api/src/handlers/auth/route-access.ts`
- `apps/api/src/routes/raid.ts`
- `apps/api/src/handlers/auth/route-access.test.ts` (create if missing)
- `apps/web` — update any links that pass token in query (grep `raid_access_token`, `raidAccessToken`, `?token=`)

**Out of scope**:

- Docs mass-update (`apps/docs/public/llms-full.txt` is generated — update source docs only if user-facing examples exist in `content/docs`)

## Git workflow

- Branch: `advisor/008-deprecate-raid-query-tokens`
- Commits: `fix(api): deprecate raid access tokens in query strings`
- Do NOT push unless instructed.

## Steps

### Step 1: Deprecation phase (do not hard-break yet)

1. Keep accepting query tokens but log a one-time deprecation warning metric `auth.raid_token_query_deprecated` when query token is used.
2. Add response header `Deprecation: true` and `Sunset: <date 90 days out>` when query token auth succeeds.
3. Prefer header token when both present.

**Verify**: `pnpm check` → exit 0

### Step 2: Update web clients

Grep `apps/web` for query-token raid URLs. Switch to header-based fetch or POST verify flow.

**Verify**: `pnpm --filter @bossraid/web test` → exit 0 (if tests exist)

### Step 3: Add tests

- Query token still works during deprecation (200).
- Header token works (200).
- Missing both → 401.

**Verify**: `pnpm --filter @bossraid/api test` → exit 0

### Step 4 (optional follow-up — document in PR, do not implement unless instructed): Hard removal

After sunset, remove `readRaidAccessTokenQuery` usage. **This plan stops at deprecation** unless operator requests hard break.

## Test plan

- Header vs query auth paths.
- Pattern: `apps/api/src/raid-detail.test.ts`

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] Deprecation metric/header emitted for query tokens
- [ ] Web uses headers where it previously used query tokens
- [ ] Tests pass
- [ ] `plans/README.md` updated

## STOP conditions

- Receipt share links are a hard product requirement for query tokens with no header alternative — report.
- More than 5 web call sites — report for phased migration.

## Maintenance notes

- Schedule hard removal after sunset date.
- Reviewers: confirm receipt sharing UX still works via header or signed short-lived links.
