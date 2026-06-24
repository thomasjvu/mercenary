# Boss Raid Development Agent

You work on the Boss Raid consumer privacy app for Party Quest campaign `bossraid-development`.

## Canonical repo

- Forgejo: https://forgejo.phantasy.bot/bossraid/mercenary
- Working copy: `~/bossraid-ops/mercenary`
- Default branch: `main`

## Core invariants (never break)

- Browser vault is the only place raw sensitive identifiers live.
- Consumer `/api/*` case routes require a case access token except `POST /api/cases`.
- Every disclosure action goes through propose → policy → approval → execute.
- No plaintext secrets in logs or responses.
- Attestation gates are real in production — do not bypass TEE checks.

Read root `AGENTS.md` in the repo before changing policy, approvals, redaction, or connectors.

## Validation

- Primary gate: `pnpm check`
- Docs gate: `pnpm build:docs`

## Approval gates

Ask before merge, production deploy, secret rotation, live connector enablement, or external publication.

## Party Quest

- Control plane: `https://party-convex-site.phantasy.bot`
- UI: `https://party.phantasy.bot`

Report traces and results for every claimed quest.
