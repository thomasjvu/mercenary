# Plan 009: Enforce seller upstream key encryption in production

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/control-state/seller-upstream.ts apps/api/src/routes/seller-upstream.ts apps/api/src/routes/health.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

When `BOSSRAID_SECRET_ENCRYPTION_KEY` is unset, seller upstream API keys (Venice, Redpill, etc.) are stored as plaintext in `apiKeyCiphertext` (`seller-upstream.ts:47-49`). SQLite backups expose third-party inference credentials.

## Current state

- `apps/api/src/control-state/seller-upstream.ts:47-49` — plaintext fallback.
- `apps/api/src/routes/health.ts:47-49` — `/ready` checks encryption for memory backend exemption.
- `apps/api/src/lib/production-readiness.ts` — production gates include secrets encryption.

## Commands you will need

| Purpose   | Command                            | Expected on success |
| --------- | ---------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test` | exit 0              |
| Typecheck | `pnpm check`                       | exit 0              |

## Scope

**In scope**:

- `apps/api/src/control-state/seller-upstream.ts`
- `apps/api/src/routes/seller-upstream.ts` (connect handler)
- `apps/api/src/seller-upstream.test.ts` (extend)
- `content/docs/reference/env.md` — note production requirement (if not already clear)

**Out of scope**:

- Encryption cipher implementation (`lib/cipher.ts`)
- Phala deploy scripts

## Git workflow

- Branch: `advisor/009-enforce-seller-upstream-encryption`
- Commits: `fix(api): reject plaintext seller upstream keys in production`
- Do NOT push unless instructed.

## Steps

### Step 1: Reject plaintext upsert in production

In `upsertSellerUpstreamConfig` (or caller in seller-upstream route):

1. When `NODE_ENV === 'production'` and `!input.cipher.enabled`, throw/return 503 with clear error: encryption key required.
2. In development, keep plaintext allowed but log warning once per process.

**Verify**: `pnpm check` → exit 0

### Step 2: Startup migration for existing plaintext rows

On API startup (control state load), if cipher becomes enabled:

1. Detect entries where `apiKeyCiphertext` does not look encrypted (heuristic: no cipher prefix / fails decrypt try).
2. Re-encrypt in place OR mark for seller re-connect.

Prefer: if decrypt fails with cipher enabled, require seller to reconnect (safer than guessing plaintext).

**Verify**: manual — document behavior in PR; add unit test with mock cipher.

### Step 3: Tests

Extend `seller-upstream.test.ts`:

- Production env + no encryption key → connect returns error
- Dev env + no key → still stores (with warning path stubbed)
- Production + key → stores ciphertext

**Verify**: `pnpm --filter @bossraid/api test -- seller-upstream` → exit 0

## Test plan

- Production rejection + happy encrypt path.
- Pattern: `apps/api/src/seller-upstream.test.ts`

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] Production cannot persist new plaintext upstream keys
- [ ] Tests pass
- [ ] No secret values in tests or commits
- [ ] `plans/README.md` updated

## STOP conditions

- Cipher API cannot encrypt without stable key ID — report.
- Migration would corrupt existing seller keys — stop and report ops runbook need.

## Maintenance notes

- Operators must set `BOSSRAID_SECRET_ENCRYPTION_KEY` before seller onboarding in production.
- Reviewers: confirm `/ready` `secretsEncrypted` gate aligns with new enforcement.
