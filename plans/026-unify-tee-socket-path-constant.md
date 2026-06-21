# Plan 026: Unify TEE socket path constant

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4ed256f..HEAD -- packages/constants/src/index.ts packages/privacy-engine/src/verify-submission-attestation.ts apps/api/src/routes/host-attestation.ts`
> On mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/021-align-api-tee-socket-default.md
- **Category**: tech-debt
- **Planned at**: commit `4ed256f`, 2026-06-21

## Why this matters

Plan 021 aligned API routes to `dstack.sock`, but `@bossraid/constants` still
exports `TEE.DEFAULT_SOCKET_PATH: '/var/run/tappd.sock'`. Privacy-engine,
provider-agent, and API each embed their own fallback string. Deployments that
read constants or omit `BOSSRAID_TEE_SOCKET_PATH` can probe different sockets
across host attestation, submission verify, and provider-agent paths.

## Current state

Conflicting defaults:

- `packages/constants/src/index.ts:198` — `DEFAULT_SOCKET_PATH: '/var/run/tappd.sock'`
- `apps/api/src/routes/host-attestation.ts:94` — `?? '/var/run/dstack.sock'`
- `packages/privacy-engine/src/verify-submission-attestation.ts:76` — dstack default
- `apps/provider-agent/src/privacy-attestation.ts:23` — dstack default
- `packages/privacy-engine/src/attestation.ts:13-14` — internal resolver tries both

Docs:

- `content/docs/reference/env.md` — documents dstack default for Phala CVM

## Commands you will need

| Purpose       | Command                                                                | Expected on success |
| ------------- | ---------------------------------------------------------------------- | ------------------- |
| Typecheck     | `pnpm check`                                                           | exit 0              |
| Privacy tests | `pnpm --filter @bossraid/privacy-engine test`                          | all pass            |
| Host tests    | `cd apps/api && node --import tsx --test src/host-attestation.test.ts` | all pass            |
| Lint          | `pnpm lint`                                                            | exit 0              |

## Scope

**In scope**:

- `packages/constants/src/index.ts` — update `TEE.DEFAULT_SOCKET_PATH` to dstack;
  add `readTeeSocketPath(env?: NodeJS.ProcessEnv): string` helper
- `apps/api/src/routes/host-attestation.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/routes/ops.ts` (if hardcoded fallback exists)
- `packages/privacy-engine/src/verify-submission-attestation.ts`
- `packages/privacy-engine/src/attestation.ts` (use constant in resolver)
- `apps/provider-agent/src/privacy-attestation.ts`
- `content/docs/reference/env.md` — single source note

**Out of scope**:

- Docker compose mounts (already set explicit env)
- Legacy EigenCompute operators who rely on tappd without env — they must set
  `BOSSRAID_TEE_SOCKET_PATH=/var/run/tappd.sock` explicitly (document)

## Git workflow

- Branch: `advisor/026-unify-tee-socket-path-constant`
- Commit example: `refactor(constants): centralize TEE socket path default`
- Do NOT push unless instructed

## Steps

### Step 1: Add helper in constants

In `packages/constants/src/index.ts`:

```typescript
export function readTeeSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.BOSSRAID_TEE_SOCKET_PATH?.trim() || TEE.DEFAULT_SOCKET_PATH;
}
```

Change `TEE.DEFAULT_SOCKET_PATH` to `'/var/run/dstack.sock'`.

Export from package index if not already re-exported.

**Verify**: `pnpm --filter @bossraid/constants check` → exit 0.

### Step 2: Replace string literals

```bash
rg "'/var/run/(dstack|tappd)\.sock'" apps/api packages/privacy-engine apps/provider-agent
```

Replace each env fallback with `readTeeSocketPath(env)` from `@bossraid/constants`.
Pass explicit `env` in tests where `process.env` is controlled.

**Verify**: `rg "'/var/run/tappd\.sock'" apps/api packages/privacy-engine apps/provider-agent` → only comments/docs or explicit legacy notes.

### Step 3: Run attestation-related tests

```bash
pnpm --filter @bossraid/privacy-engine test
cd apps/api && node --import tsx --test src/host-attestation.test.ts
pnpm --filter @bossraid/orchestrator test -- src/raid-provider-dispatch.test.ts
```

**Verify**: all pass.

### Step 4: Document legacy tappd override

In `content/docs/reference/env.md`, note that EigenCompute/tappd deployments must
set `BOSSRAID_TEE_SOCKET_PATH=/var/run/tappd.sock` explicitly; default is dstack.

**Verify**: `pnpm check` → exit 0.

## Test plan

- Existing host-attestation and raid-provider-dispatch tests are regression suite.
- Optional: constants unit test for `readTeeSocketPath` with/without env override.

## Done criteria

- [ ] Single `TEE.DEFAULT_SOCKET_PATH` in constants (`dstack.sock`)
- [ ] `readTeeSocketPath` used in api, privacy-engine, provider-agent
- [ ] No scattered `tappd.sock` fallbacks in production code paths
- [ ] `pnpm check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Constants package cannot export new helper without circular deps — STOP with import graph.
- Tests require tappd default on developer Mac without env — set test env explicitly, do not revert default.

## Maintenance notes

- All new TEE socket reads must use `readTeeSocketPath`.
- Phala deploy continues to set explicit env in compose files.
