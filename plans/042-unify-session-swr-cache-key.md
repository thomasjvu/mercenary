# Plan 042: Unify mercenary session SWR cache key

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 783eadf..HEAD -- apps/web/src/hooks/useWalletAuth.ts apps/web/src/hooks/useMercenaryPayment.ts`
> On mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `783eadf`, 2026-06-21

## Why this matters

The mercenary workspace mounts both `useWalletAuth` and `useMercenaryPayment`.
They fetch the same `GET /v1/session` endpoint but use different SWR cache keys
(`'wallet-session'` vs `'/v1/session'`), causing duplicate requests and
revalidation on every mercenary load.

## Current state

- `apps/web/src/hooks/useWalletAuth.ts:13` — `useSWR('wallet-session', fetchSession, ...)`
- `apps/web/src/hooks/useMercenaryPayment.ts:25` — `useSWR('/v1/session', fetchSession)`

Both use `fetchSession` from `../api` / `../api/auth.js`.

## Commands you will need

| Purpose   | Command                            | Expected on success |
| --------- | ---------------------------------- | ------------------- |
| Web tests | `pnpm --filter @bossraid/web test` | all pass            |
| Typecheck | `pnpm check`                       | exit 0              |
| Lint      | `pnpm lint`                        | exit 0              |

## Scope

**In scope**:

- `apps/web/src/api/auth.ts` (or new `apps/web/src/lib/session-cache.ts`) — export shared key constant
- `apps/web/src/hooks/useWalletAuth.ts`
- `apps/web/src/hooks/useMercenaryPayment.ts`
- Any other hooks using `'/v1/session'` or `'wallet-session'` for `fetchSession` (grep first)

**Out of scope**:

- Splitting `useWalletAuth` from ethereum-provider (deferred 178)
- Session API changes
- Global SWR provider refactor

## Git workflow

- Branch: `advisor/042-unify-session-swr-cache-key`
- Commit example: `perf(web): share session SWR cache key across mercenary hooks`
- Do NOT push unless instructed

## Steps

### Step 1: Export shared cache key

Add to `apps/web/src/api/auth.ts` (or adjacent module imported by both hooks):

```typescript
export const SESSION_SWR_KEY = 'wallet-session' as const;
```

Use the existing `wallet-session` key as canonical (already used by wallet auth).

### Step 2: Update hooks

- `useWalletAuth` — `useSWR(SESSION_SWR_KEY, fetchSession, ...)`
- `useMercenaryPayment` — same key and fetcher

Grep for other `useSWR('/v1/session'` or `'wallet-session'` session fetches and align.

**Verify**:

```bash
rg "useSWR\(['\"]/(v1/session|wallet-session)" apps/web/src
```

→ all session hooks use `SESSION_SWR_KEY`.

### Step 3: Verify mutate compatibility

Ensure `useWalletAuth` `session.mutate` paths still invalidate mercenary payment state
(and vice versa if mercenary mutates session). If mercenary never mutates, no change needed.

**Verify**:

```bash
pnpm check
pnpm --filter @bossraid/web test
pnpm lint
```

## Test plan

- Optional: tiny unit test asserting `SESSION_SWR_KEY` is exported (low value).
- Rely on existing hook tests passing.

## Done criteria

- [ ] Single SWR key for `fetchSession` across wallet + mercenary hooks
- [ ] `pnpm check` and web tests pass
- [ ] `plans/README.md` status row updated

## STOP conditions

- Another hook relies on isolated `/v1/session` cache intentionally — document and use shared `mutate` instead of separate keys.
- `fetchSession` implementations differ between imports — unify fetcher first.

## Maintenance notes

- New session consumers must import `SESSION_SWR_KEY`.
- Full wallet bundle split remains deferred plan 178.
