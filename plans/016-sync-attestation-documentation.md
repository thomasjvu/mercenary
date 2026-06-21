# Plan 016: Sync attestation documentation after public host proof

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat fcbeaf9..HEAD -- content/docs/`
> If Plan 014 landed first, document its final response fields — not excerpts below.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/014-host-attestation-trust-model.md (if 014 changes response shape)
- **Category**: docs
- **Planned at**: commit `fcbeaf9`, 2026-06-20

## Why this matters

Public `GET /v1/host/attestation`, the web attestation inspector, and Phala
dstack socket deploy defaults shipped without a coordinated docs pass. Operators
reading `routes.md` hit a broken markdown table; `proof.md` still lists
`/receipt` as canonical; `AGENTS.md` points to `architecture.md` for "partial
attestation" but architecture is silent. This causes integration mistakes and
overstated trust expectations (structural vs cloud verify, MNEMONIC optional).

## Current state

Broken table (`content/docs/reference/routes.md` lines 45-57):

```
| `GET /v1/raid/:raidId/agent_log.json` | ... |

| `GET /v1/agent.json` | — | Mercenary manifest |
| `GET /v1/host/attestation` | — | Public host TEE proof ...
```

Missing header row between line 45 and 47 — second table fragment.

`content/docs/overview/proof.md` line 7: canonical URL `/receipt?raidId=...`
but web uses `/verification` (`apps/web/src/App.tsx`).

`AGENTS.md` line 60: "attestation telemetry is still partial" → architecture.md
has no attestation subsection.

`content/docs/reference/env.md`: `MNEMONIC` and `BOSSRAID_TEE_RUNTIME_MODE`
under-documented for host route.

`content/dev-docs/operators/local-development.md` lines 33-40: omits public
host attestation route.

Docs sync rule (AGENTS.md): routes → `routes.md`; env → `env.md`; runtime →
`runtime.md`; architecture → `architecture.md`.

## Commands you will need

| Purpose          | Command                 | Expected on success            |
| ---------------- | ----------------------- | ------------------------------ |
| Format check     | `pnpm format:check`     | exit 0 on touched md           |
| Docs routes sync | `pnpm sync:docs-routes` | exit 0 (if web routes touched) |

## Scope

**In scope**:

- `content/docs/reference/routes.md`
- `content/docs/overview/proof.md`
- `content/docs/operators/architecture.md` (new attestation subsection)
- `content/docs/reference/env.md`
- `content/docs/operators/runtime.md`
- `content/dev-docs/operators/local-development.md`
- `AGENTS.md` (retarget partial-attestation pointer)

**Out of scope**:

- `apps/docs` generated artifacts unless `pnpm sync:docs-routes` requires it
- Hackathon appendix (optional one-line `/verification` fix if trivial)
- Infisical MNEMONIC tier changes (operational, not docs-only)

## Git workflow

- Branch: `advisor/016-sync-attestation-documentation`
- Commit example: `docs(operators): sync host attestation proof surface`
- Do NOT push unless instructed

## Steps

### Step 1: Fix routes.md table

Merge lines 47-57 into the "Status, proof, discovery" table with a single
header. Ensure `GET /v1/host/attestation` row documents:

- Public, rate-limited
- Phala TDX quote via dstack guest agent (`/var/run/dstack.sock`)
- Optional `signedRuntime` when `MNEMONIC` set
- If Plan 014 landed: structural vs cloud verify env flags

**Verify**: `pnpm format:check` on edited files → pass

### Step 2: Update proof.md

- Change canonical receipt URL to `/verification?raidId=...` (note `/receipt` redirect)
- Add `GET /v1/raid/:raidId/attested-result` to API table
- Extend "What to inspect" with bullets: host TEE quote, signed runtime envelope,
  upstream marketplace TEE, inference receipt verify
- Document host verify tier: structural default on host unless cloud verify enabled
  (match Plan 014 final behavior)

**Verify**: manual read — no broken markdown tables

### Step 3: Architecture + AGENTS cross-link

Add "## Attestation & proof" subsection to `architecture.md`:

- Public host route vs admin `attested-runtime` vs raid `attested-result`
- Web inspector entry points (sidebar, receipt, marketplace)
- Known gaps: MNEMONIC not in Phala core secrets tier, telemetry partial

Update `AGENTS.md` line 60 to point to `proof.md` + new architecture subsection.

**Verify**: links resolve in repo

### Step 4: env.md and runtime.md

`env.md`: document `BOSSRAID_TEE_SOCKET_PATH` (default `/var/run/dstack.sock`),
`BOSSRAID_TEE_RUNTIME_MODE`, `MNEMONIC`, `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY`
(if Plan 014 added), `BOSSRAID_UPSTREAM_TEE_CLOUD_VERIFY` scope (marketplace/upstream).

`runtime.md`: clarify `pnpm verify:attestation` verifies MNEMONIC envelopes only;
add `GET /v1/host/attestation` curl example for Phala operators.

`local-development.md`: lead with public host route for optional signed runtime.

**Verify**: `pnpm format:check` → pass

## Test plan

- No code tests — docs-only
- Optional: `pnpm sync:docs-routes` if web route template references change

## Done criteria

- [ ] `routes.md` renders as one continuous table (no orphan headerless rows)
- [ ] `proof.md` uses `/verification` as canonical receipt URL
- [ ] `architecture.md` has attestation subsection; `AGENTS.md` pointer updated
- [ ] `env.md` and `runtime.md` describe host attestation operator surface
- [ ] `pnpm format:check` passes on edited markdown
- [ ] `plans/README.md` row 016 → DONE

## STOP conditions

- Plan 014 response shape still in flux — STOP until 014 DONE, then document final fields.
- Drift makes excerpts inaccurate.

## Maintenance notes

- Any new attestation env var must update `env.md` per AGENTS.md rules.
- Reviewer: spot-check published docs site if `pnpm papers:sync-downstream` is part of release.
