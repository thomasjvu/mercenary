# Plan 021: Align API TEE socket default to dstack

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d547ff6..HEAD -- apps/api/src/routes/host-attestation.ts apps/api/src/routes/health.ts packages/privacy-engine/src/attestation.ts deploy/phala/`
> Compare excerpts on mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/016-sync-attestation-documentation.md
- **Category**: tech-debt
- **Planned at**: commit `d547ff6`, 2026-06-21

## Why this matters

Phala CVM deploys mount the dstack guest agent at `/var/run/dstack.sock`.
Eighth-pass docs and provider-agent default to dstack, but API host attestation
and health routes still fall back to `/var/run/tappd.sock`. Operators following
docs without setting `BOSSRAID_TEE_SOCKET_PATH` get 503 host attestation on
Phala while other components probe dstack via `privacy-engine` candidate list.

## Current state

API defaults:

- `apps/api/src/routes/host-attestation.ts:94` — `?? '/var/run/tappd.sock'`
- `apps/api/src/routes/health.ts:45` — same pattern (verify line)

Aligned defaults:

- `apps/provider-agent/src/privacy-attestation.ts:23` — `'/var/run/dstack.sock'`
- `packages/privacy-engine/src/attestation.ts:13-14` — `DSTACK_SOCKET_PATH` constant
- `content/docs/reference/env.md` — documents dstack default
- `deploy/phala/docker-compose.yml` — `BOSSRAID_TEE_SOCKET_PATH=/var/run/dstack.sock`

Production readiness message (`production-readiness.ts:239`) still says "tappd socket".

## Commands you will need

| Purpose    | Command                                                                | Expected on success |
| ---------- | ---------------------------------------------------------------------- | ------------------- |
| Typecheck  | `pnpm check`                                                           | exit 0              |
| Host tests | `cd apps/api && node --import tsx --test src/host-attestation.test.ts` | all pass            |
| Lint       | `pnpm lint`                                                            | exit 0              |

## Scope

**In scope**:

- `apps/api/src/routes/host-attestation.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/lib/production-readiness.ts` (tee check message only)
- Any other `apps/api` files with hardcoded `tappd.sock` fallback (grep first)

**Out of scope**:

- `privacy-engine` resolver order (already tries dstack)
- Legacy EigenCompute tappd deployments without env override

## Git workflow

- Branch: `advisor/021-align-api-tee-socket-default`
- Commit example: `fix(api): default TEE socket to dstack for Phala CVM`
- Do NOT push unless instructed

## Steps

### Step 1: Grep and list API tappd fallbacks

```bash
rg "tappd\.sock" apps/api/src
```

Update each fallback default to `/var/run/dstack.sock` unless the file is
explicitly EigenCompute-only (document exception in commit message).

**Verify**: `rg "tappd\.sock" apps/api/src` → no default fallbacks remain (env examples OK)

### Step 2: Update production-readiness tee message

Change `tee_attestation` check message from "tappd" to "dstack guest agent"
wording; keep same pass condition (platform phala + socket mounted).

**Verify**: `cd apps/api && node --import tsx --test src/lib/production-readiness.test.ts` → pass

### Step 3: Regression tests

Host attestation tests use explicit socket paths — should still pass.

**Verify**: `cd apps/api && node --import tsx --test src/host-attestation.test.ts` → all pass

### Step 4: Full gates

**Verify**: `pnpm check` → exit 0

**Verify**: `pnpm lint` → exit 0

## Test plan

- Existing `host-attestation.test.ts` — no change required if tests set explicit paths
- Optional: add test that default env (no `BOSSRAID_TEE_SOCKET_PATH`) uses dstack path string in route module (unit-level constant test if extracted)

## Done criteria

- [ ] API TEE socket default is `/var/run/dstack.sock` in host + health routes
- [ ] Production-readiness message references dstack
- [ ] `pnpm check`, `pnpm lint`, host-attestation tests pass
- [ ] `plans/README.md` row 021 → DONE

## STOP conditions

- Deploy compose or Infisical still injects tappd path exclusively — STOP; document dual-default strategy.
- Changing default breaks CI tests expecting tappd — update tests in scope.

## Maintenance notes

- Legacy tappd operators must set `BOSSRAID_TEE_SOCKET_PATH=/var/run/tappd.sock` explicitly.
- Reviewer: confirm Phala deploy smoke still hits `GET /v1/host/attestation` 200.
