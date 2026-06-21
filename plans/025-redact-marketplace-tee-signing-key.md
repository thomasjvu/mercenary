# Plan 025: Redact marketplace TEE signingKey from API response

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4ed256f..HEAD -- apps/api/src/routes/marketplace-tee.ts`
> On mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `4ed256f`, 2026-06-21

## Why this matters

`POST /v1/marketplace/tee/attestation` returns upstream `signingKey` material
in JSON to any authenticated wallet session. Buyers only need `signingAddress`
and attestation validity for E2EE display; exposing the raw key increases blast
radius if responses are logged, cached, or intercepted.

Server-side E2EE session setup (`apps/api/src/lib/venice-e2ee.ts`) can retain
key material internally without serializing it to clients.

## Current state

Response leak:

- `apps/api/src/routes/marketplace-tee.ts:153-166` — includes
  `signingKey: (result as { signingKey?: string }).signingKey`

Upstream populates key:

- `packages/privacy-engine/src/upstream-tee/verify.ts` — `signingKey` on verify result

Web consumers to audit (grep):

```bash
rg "signingKey" apps/web/src apps/api/src
```

Preflight or seller-only routes may still need server-side access — not public
marketplace attestation response.

## Commands you will need

| Purpose   | Command                                                               | Expected on success |
| --------- | --------------------------------------------------------------------- | ------------------- |
| API tests | `cd apps/api && node --import tsx --test src/ops-attestation.test.ts` | pass if exists      |
| Grep      | `rg "signingKey" apps/api/src/routes/marketplace-tee.ts`              | no response field   |
| Typecheck | `pnpm check`                                                          | exit 0              |
| Lint      | `pnpm lint`                                                           | exit 0              |

## Scope

**In scope**:

- `apps/api/src/routes/marketplace-tee.ts`
- `apps/api/src/routes/marketplace-tee.test.ts` (create if missing)
- `apps/web/src` — remove any dependency on `signingKey` from marketplace TEE response
- `content/docs/reference/routes.md` — update response field list if `signingKey` documented

**Out of scope**:

- Changing privacy-engine upstream verify internals
- Seller preflight routes that never exposed key to browsers (verify first)

## Git workflow

- Branch: `advisor/025-redact-marketplace-tee-signing-key`
- Commit example: `fix(api): omit signingKey from marketplace TEE attestation response`
- Do NOT push unless instructed

## Steps

### Step 1: Grep consumers

```bash
rg "signingKey" apps/web/src apps/api/src content/docs
```

List every read site. Web must not require `signingKey` from marketplace route.

**Verify**: inventory complete.

### Step 2: Remove field from route response

In `marketplace-tee.ts`, delete `signingKey` from the JSON payload. Keep
`signingAddress`, `valid`, quote fields, and explorer URL.

If TypeScript types require the field, narrow the response type.

**Verify**:

```bash
rg "signingKey" apps/api/src/routes/marketplace-tee.ts
```

→ no matches in response object (imports/types OK).

### Step 3: Fix web consumers

Update any web code that read `signingKey` from marketplace attestation to
use `signingAddress` only, or fetch E2EE session via existing server-mediated flow.

**Verify**: `pnpm --filter @bossraid/web check` → exit 0.

### Step 4: Add API regression test

Create or extend test asserting marketplace TEE response JSON does not contain
`signingKey` key (mock upstream verify returning a key internally).

**Verify**:

```bash
cd apps/api && node --import tsx --test 'src/**/*marketplace*test*.ts' 'src/ops-attestation.test.ts'
```

→ pass.

### Step 5: Update routes docs if needed

If `content/docs/reference/routes.md` lists `signingKey` on marketplace TEE
response, remove it and note `signingAddress` is the public field.

**Verify**: `pnpm format:check` on edited md (or run prettier on that file).

## Test plan

- API test: response body has `signingAddress`, lacks `signingKey`
- Optional: web test if a hook parsed `signingKey` — update expectation

## Done criteria

- [ ] `POST /v1/marketplace/tee/attestation` response omits `signingKey`
- [ ] No web client reads `signingKey` from that endpoint
- [ ] Regression test exists
- [ ] `pnpm check` and `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Web E2EE flow breaks without `signingKey` and requires server API change beyond
  redaction — STOP with required endpoint design.
- Seller preflight route is the only consumer and is seller-authenticated only —
  document and limit scope to public marketplace route only.

## Maintenance notes

- Never add cryptographic key material to public JSON responses; use addresses and
  server-side session establishment.
- Review new attestation routes for similar fields in PR review.
