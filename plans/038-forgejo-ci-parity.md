# Plan 038: Align Forgejo CI with GitHub verification

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 783eadf..HEAD -- .forgejo/workflows/ci.yml .github/workflows/ci.yml`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `783eadf`, 2026-06-21

## Why this matters

Forgejo is the primary CI surface for agent-driven workflows in this repo, but
`.forgejo/workflows/ci.yml` is weaker than `.github/workflows/ci.yml`: dependency
audit uses `--audit-level=critical` only (GitHub uses `high`), and Forgejo omits
bounty-escrow smoke, e2e smoke, and production deploy-env audit. Green Forgejo
runs can mask issues GitHub would catch.

## Current state

`.forgejo/workflows/ci.yml:34-42` — stops after `test:attestation`.

`.github/workflows/ci.yml:31-67` — adds `audit-level=high`, `test:bounty-escrow:local`,
`test:smoke:e2e`, and `audit-production-deploy-env.mjs`.

## Commands you will need

| Purpose     | Command                         | Expected on success |
| ----------- | ------------------------------- | ------------------- |
| Lint        | `pnpm lint`                     | exit 0              |
| Local smoke | `pnpm test:bounty-escrow:local` | pass (may be slow)  |

## Scope

**In scope**:

- `.forgejo/workflows/ci.yml`

**Out of scope**:

- GitHub workflow changes (already complete)
- Turbo cache / build optimizations
- New test suites

## Git workflow

- Branch: `advisor/038-forgejo-ci-parity`
- Commit example: `ci(forgejo): align audit level and smoke jobs with GitHub`
- Do NOT push unless instructed

## Steps

### Step 1: Match audit threshold

Change Forgejo `pnpm audit --audit-level=critical` to `--audit-level=high`.

**Verify**: diff against `.github/workflows/ci.yml:32`.

### Step 2: Add missing CI steps

After `pnpm test:attestation`, append steps mirroring GitHub:

```yaml
- run: pnpm test:bounty-escrow:local
  timeout-minutes: 15
- run: pnpm test:smoke:e2e
  timeout-minutes: 15
- run: NODE_ENV=production BOSSRAID_SETTLEMENT_MODE=onchain BOSSRAID_X402_ENABLED=true BOSSRAID_SETTLEMENT_FUND_JOBS=true BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS=true BOSSRAID_BOUNTY_ESCROW_ADDRESS=0x0000000000000000000000000000000000000201 BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET=ci-audit-secret BOSSRAID_SECRET_ENCRYPTION_KEY=ci-audit-encryption-key node scripts/audit-production-deploy-env.mjs
```

Copy env vars verbatim from `.github/workflows/ci.yml:67`.

**Verify**: `diff` Forgejo vs GitHub post-attestation steps — only runner labels may differ.

### Step 3: Optional local validation

Run `pnpm test:smoke:e2e` locally if environment allows (may require ports/services).

## Test plan

- Workflow YAML only; CI validates on next push.

## Done criteria

- [ ] Forgejo audit level is `high`
- [ ] Forgejo runs bounty-escrow, e2e smoke, deploy-env audit
- [ ] `plans/README.md` status row updated

## STOP conditions

- Forgejo runner lacks resources for e2e smoke — document in commit and keep job with timeout; STOP if runner cannot reach network at all.
- New audit failures block CI — fix advisories or document overrides; do not downgrade back to `critical`.

## Maintenance notes

- When adding GitHub CI steps, mirror them in Forgejo in the same PR.
