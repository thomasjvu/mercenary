# Plan 020: Fix web ReadyResponse types and CI test discovery

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d547ff6..HEAD -- apps/web/src/api/health.ts apps/web/package.json apps/api/src/routes/health.ts`
> Compare excerpts on mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `d547ff6`, 2026-06-21

## Why this matters

`pnpm --filter @bossraid/web check` fails because `ReadyResponse` omits `payment`
while hooks read `ready.payment.enabled`. Separately, `apps/web/package.json`
runs `node --import tsx --test` without a glob, so ~26 web unit tests never run
under `pnpm test:unit` / CI turbo `test` — including attestation/receipt view tests
added in the eighth pass.

## Current state

Web type (`apps/web/src/api/health.ts:11-28`) — no `payment` field.

API `/ready` (`apps/api/src/routes/health.ts:116-131`) returns:

```typescript
return {
  ok,
  gates,
  providers: ...,
  readyProviders: ...,
  storage: persistence,
  payment: {
    enabled: x402Config.enabled,
    network: x402Config.network,
    asset: x402Config.asset,
    facilitatorConfigured: Boolean(x402Config.facilitatorUrl),
  },
  settlement: { mode: settlementMode, configured: settlementConfigured },
};
```

Consumers:

- `apps/web/src/hooks/useAccountPage.ts:87` — `ready.payment.enabled`
- `apps/web/src/hooks/useCreateAndFundBounty.ts:21`
- `apps/web/src/components/mercenary/MercenaryWorkspace.tsx:35`

Web test script (`apps/web/package.json:10-11`):

```json
"test": "node --import tsx --test",
"test:all": "node --import tsx --test 'src/**/*.test.ts'"
```

API pattern (`apps/api/package.json`) uses glob in default `test` script.

## Commands you will need

| Purpose   | Command                             | Expected on success |
| --------- | ----------------------------------- | ------------------- |
| Web check | `pnpm --filter @bossraid/web check` | exit 0              |
| Web tests | `pnpm --filter @bossraid/web test`  | all pass            |
| Lint      | `pnpm lint`                         | exit 0              |

## Scope

**In scope**:

- `apps/web/src/api/health.ts`
- `apps/web/package.json`

**Out of scope**:

- Slimming `/ready` response (Plan 007 docs debt)
- Moving types to `@bossraid/shared-types` (deferred DEBT-02)
- CI workflow file unless needed to confirm turbo picks up web tests after script fix

## Git workflow

- Branch: `advisor/020-fix-web-ready-types-and-ci-tests`
- Commit example: `fix(web): align ReadyResponse with API and run unit test glob`
- Do NOT push unless instructed

## Steps

### Step 1: Extend ReadyResponse

Add to `apps/web/src/api/health.ts`:

```typescript
export type ReadyPayment = {
  enabled: boolean;
  network?: string;
  asset?: string;
  facilitatorConfigured?: boolean;
};

export type ReadySettlement = {
  mode: string;
  configured: boolean;
};
```

Extend `ReadyResponse` with optional `payment?: ReadyPayment` and
`settlement?: ReadySettlement` matching API `/ready` shape.

**Verify**: `pnpm --filter @bossraid/web check` → exit 0

### Step 2: Fix web test script glob

Change `apps/web/package.json` `test` script to match `test:all`:

```json
"test": "node --import tsx --test 'src/**/*.test.ts'"
```

**Verify**: `pnpm --filter @bossraid/web test` → all tests pass (report count ≥20)

### Step 3: Lint

**Verify**: `pnpm lint` → exit 0

## Test plan

- Existing `apps/web/src/lib/api-readiness.test.ts` and receipt attestation tests should run under new glob
- Typecheck is the primary gate for Step 1

## Done criteria

- [ ] `pnpm --filter @bossraid/web check` exits 0
- [ ] `pnpm --filter @bossraid/web test` discovers and passes all `src/**/*.test.ts`
- [ ] `plans/README.md` row 020 → DONE

## STOP conditions

- API `/ready` shape changed — re-read `health.ts` and align types before proceeding.
- Web tests fail broadly due to env/network — fix only test-env issues in scope; STOP if >5 unrelated failures.

## Maintenance notes

- When `/ready` is slimmed per Plan 007, migrate web consumers to a dedicated payment-config endpoint.
- Consider shared-types export in a follow-up (plan DEBT-02).
