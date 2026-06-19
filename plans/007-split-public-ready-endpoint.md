# Plan 007: Split public `/ready` from diagnostics

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/routes/health.ts apps/api/src/ops-readiness.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

`GET /ready` returns settlement mode, encryption key ID, x402 facilitator configuration, TEE socket state, and production gate booleans without authentication (`health.ts:39-130`). Load balancers need liveness; attackers use the full payload for reconnaissance.

Admin diagnostics already exist at `GET /v1/ops/production-readiness` (`ops.ts:339-383`) behind `requireAdmin`.

## Current state

- `apps/api/src/routes/health.ts` — `/ready` returns `{ ok, gates, encryption, payment, settlement, ... }`.
- `apps/api/src/routes/ops.ts` — admin production readiness report.

## Commands you will need

| Purpose   | Command                                             | Expected on success |
| --------- | --------------------------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test -- ops-readiness` | exit 0              |
| Typecheck | `pnpm check`                                        | exit 0              |

## Scope

**In scope**:

- `apps/api/src/routes/health.ts`
- `apps/api/src/health.test.ts` (create or extend if exists)

**Out of scope**:

- `/v1/ops/production-readiness` shape
- Web ops UI consumers

## Git workflow

- Branch: `advisor/007-split-public-ready-endpoint`
- Commits: `fix(api): minimize public ready endpoint response`
- Do NOT push unless instructed.

## Steps

### Step 1: Minimize `/ready` response

Change `GET /ready` to return only:

```typescript
{
  ok: boolean;
}
```

Compute `ok` using the same boolean logic as today (lines 98-111) but omit `gates`, `encryption`, `payment`, `settlement`, `providers`, `storage` details from the public response.

Optional: add `GET /ready/detail` behind `requireAdmin` if operators need the old payload without using ops route — only if something in-repo calls `/ready` for diagnostics (grep first).

**Verify**: `grep -n "gates" apps/api/src/routes/health.ts` → `gates` not in `/ready` return object

### Step 2: Grep for `/ready` consumers

Search repo for clients parsing `/ready` gates object (`apps/web`, `apps/ops`, scripts). Update any internal consumers to use `/v1/ops/production-readiness` or admin detail endpoint.

**Verify**: `pnpm check` → exit 0

### Step 3: Add test

Test `/ready` returns `{ ok: true | false }` only — no `gates` or `payment` keys.

**Verify**: `pnpm --filter @bossraid/api test` → exit 0

## Test plan

- Assert minimal `/ready` shape.
- Pattern: `apps/api/src/ops-readiness.test.ts`

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] Public `/ready` response has only `ok` (and nothing sensitive)
- [ ] Internal consumers updated if any broke
- [ ] `plans/README.md` updated

## STOP conditions

- External load balancers documented to require `gates` field — add admin alias instead of breaking.
- More than 3 in-repo consumers need migration — report list.

## Maintenance notes

- Never re-expand `/ready` with diagnostic fields; use ops routes.
- Reviewers: confirm Cloudflare/Phala health checks still pass with `{ ok }` only.
