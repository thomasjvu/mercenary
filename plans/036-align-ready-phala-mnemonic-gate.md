# Plan 036: Align /ready Phala TEE gate with MNEMONIC

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e204b19..HEAD -- apps/api/src/lib/tee.ts apps/api/src/routes/health.ts`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none (complements plan 030 production-readiness gate)
- **Category**: correctness
- **Planned at**: commit `e204b19`, 2026-06-21

## Why this matters

Plan 030 added `mnemonic_configured` to `GET /v1/ops/production-readiness` for
Phala deploys. Public `GET /ready` can still return `ok: true` when the dstack
socket exists but `MNEMONIC` is unset (`isTeeProductionConfigured` for Phala only
checks socket mount). Automation watching `/ready` gets a false "production ready"
signal that conflicts with ops production-readiness.

## Current state

`apps/api/src/lib/tee.ts:52-61`:

```typescript
export function isTeeProductionConfigured(env, tee) {
  if (env.BOSSRAID_TEE_PLATFORM === 'phala') {
    return tee.pathExists && tee.socketMounted;
  }
  return Boolean(env.MNEMONIC?.trim());
}
```

`apps/api/src/routes/health.ts:78-114` — `gates.teeProductionReady` uses that
function for aggregate `ok`; `gates.tee.mnemonicConfigured` is informational only.

`apps/api/src/lib/production-readiness.test.ts:101-111` — Phala without MNEMONIC
fails `mnemonic_configured`.

## Commands you will need

| Purpose   | Command                                                                        | Expected on success |
| --------- | ------------------------------------------------------------------------------ | ------------------- |
| Typecheck | `pnpm check`                                                                   | exit 0              |
| API tests | `cd apps/api && node --import tsx --test src/lib/production-readiness.test.ts` | pass                |
| New tests | `cd apps/api && node --import tsx --test src/lib/tee.test.ts` (create)         | pass                |

## Scope

**In scope**:

- `apps/api/src/lib/tee.ts`
- `apps/api/src/lib/tee.test.ts` (create)
- `apps/api/src/routes/health.ts` (only if gate composition must change beyond tee.ts)

**Out of scope**:

- Production-readiness report (already has `mnemonic_configured`)
- Phala secrets tier files (plan 030)
- Slimming `/ready` response (DOCS-01 product decision)
- Web `api-readiness.ts` copy (may already mention mnemonic — verify only)

## Git workflow

- Branch: `advisor/036-align-ready-phala-mnemonic-gate`
- Commit example: `fix(api): require MNEMONIC for Phala /ready in production`
- Do NOT push unless instructed

## Steps

### Step 1: Require MNEMONIC for Phala production TEE readiness

In `isTeeProductionConfigured`:

When `env.BOSSRAID_TEE_PLATFORM === 'phala'`:

- Keep socket checks: `tee.pathExists && tee.socketMounted`.
- When `env.NODE_ENV === 'production'`, also require `Boolean(env.MNEMONIC?.trim())`.
- Non-production (dev/test) may omit MNEMONIC so local Phala rehearsals without
  signing keys still pass `/ready` — match production-readiness dev behavior.

Target shape:

```typescript
if (env.BOSSRAID_TEE_PLATFORM === 'phala') {
  const socketReady = tee.pathExists && tee.socketMounted;
  if (env.NODE_ENV !== 'production') return socketReady;
  return socketReady && Boolean(env.MNEMONIC?.trim());
}
```

**Verify**: read `tee.ts` — non-Phala path unchanged.

### Step 2: Add unit tests

Create `apps/api/src/lib/tee.test.ts` using `node:assert/strict` + `node:test`
(pattern: `production-readiness.test.ts`).

Cases:

1. Phala + production + socket mounted + no MNEMONIC → `false`.
2. Phala + production + socket mounted + MNEMONIC set → `true`.
3. Phala + development + socket mounted + no MNEMONIC → `true` (socket only).
4. Non-Phala + MNEMONIC → `true` (existing behavior).

**Verify**: `cd apps/api && node --import tsx --test src/lib/tee.test.ts` → all pass.

### Step 3: Regression suite

```bash
pnpm check
pnpm lint
cd apps/api && node --import tsx --test src/lib/production-readiness.test.ts
```

**Verify**: exit 0.

## Test plan

- New `tee.test.ts` with 4 cases above.
- No change to production-readiness tests expected.

## Done criteria

- [ ] Phala production `/ready` `ok` false without MNEMONIC (when other gates pass)
- [ ] Dev/test Phala without MNEMONIC still can pass socket-only gate
- [ ] `pnpm check` exit 0
- [ ] `tee.test.ts` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

- Product requires `/ready` to stay socket-only even in production — STOP and
  report; alternative is documenting the mismatch in ops runbooks only.
- Change breaks CI health checks that run production mode without MNEMONIC —
  adjust test env in CI fixtures, not the production rule.

## Maintenance notes

- Any new Phala readiness signal must stay aligned between `/ready` and
  `production-readiness.ts`.
- Finding 154 deferred item is partially closed by plans 030 + this plan.
