# Plan 010: Fix streaming API-key billing capture

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 77fe426..HEAD -- apps/api/src/lib/chat-completion-pipeline.ts apps/api/src/handlers/chat.ts apps/api/src/chat-inference.test.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `77fe426`, 2026-06-19

## Why this matters

Streaming chat (`deliverStreamingChatCompletion`) records API-key usage upfront at max budget (`chat-completion-pipeline.ts:250-255`) but never calls `captureApiKeyBilling` after the raid completes. Buffered chat does capture at actual cost (`:355-362`). Streaming buyers see inflated `spentUsd` and prepaid balances are not debited correctly.

## Current state

- `apps/api/src/lib/chat-completion-pipeline.ts` — `deliverStreamingChatCompletion` vs `deliverBufferedChatCompletion`.
- `apps/api/src/handlers/chat.ts:116-130` — routes streaming requests to incomplete path.
- `apps/api/src/handlers/payment.ts` — `captureApiKeyBilling`.

Buffered capture excerpt (`chat-completion-pipeline.ts:355-362`):

```typescript
captureApiKeyBilling({
  apiKeyBilling: input.launchPayment.apiKeyBilling,
  actualCostUsd: capturedCostUsd,
  route: input.paymentRoute,
  ...
});
```

Streaming path only has upfront `recordBuyerApiKeyUsage` at max budget.

Convention: tests use `buildApiServer` + `app.inject` — `apps/api/src/chat-inference.test.ts`.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
| --------- | ---------------------------------------------------- | ------------------- |
| API tests | `pnpm --filter @bossraid/api test -- chat-inference` | exit 0              |
| Typecheck | `pnpm check`                                         | exit 0              |

## Scope

**In scope**:

- `apps/api/src/lib/chat-completion-pipeline.ts`
- `apps/api/src/handlers/chat.ts` (if wiring changes)
- `apps/api/src/chat-inference.test.ts` or new `chat-streaming-billing.test.ts`

**Out of scope**:

- x402 streaming billing (separate path)
- Mana billing (streaming already has mana capture hook at `:268-284`)

## Git workflow

- Branch: `advisor/010-streaming-api-key-billing`
- Commits: `fix(api): capture API-key billing after streaming chat completes`
- Do NOT push unless instructed.

## Steps

### Step 1: Remove upfront max-budget usage write

In `deliverStreamingChatCompletion`, remove or guard the block at lines 250-255 that calls `recordBuyerApiKeyUsage` at reservation budget before stream completes.

**Verify**: `pnpm check` → exit 0

### Step 2: Capture billing on stream completion

Inspect `streamChatCompletionResponse` in the same file or related module. Add API-key billing capture when the streamed raid reaches terminal state:

1. Compute `capturedCostUsd` the same way as buffered path (`escrowFundingUsd ?? settlement.successfulProvidersPaid ?? maxBudgetUsd`).
2. Call `deps.payment.captureApiKeyBilling` with `input.launchPayment.apiKeyBilling`.
3. Call `recordMarketplaceLedgersFromRaid` mirroring buffered path (`:366-374`).
4. If `!apiKeyBilling` but public auth is api_key, call `recordBuyerApiKeyUsage` with actual cost (buffered `:363-365`).

Mirror mana billing's `bossraidBilling.capture` callback pattern already in streaming path for consistency.

**Verify**: `pnpm --filter @bossraid/api test -- chat-inference` → exit 0

### Step 3: Add regression test

Add test with API key auth + `stream: true` chat completion:

1. Create buyer API key with spend tracking.
2. Complete streamed chat.
3. Assert `spentUsd` reflects actual cost, not max budget reservation.
4. If `useBalance`, assert balance debited.

May require mock provider returning quickly — use patterns from `chat-inference.test.ts`.

**Verify**: `pnpm --filter @bossraid/api test` → exit 0

## Test plan

- Streaming API-key capture at actual cost.
- Buffered path still passes (no regression).

## Done criteria

- [ ] `pnpm check` exits 0
- [ ] Streaming path calls `captureApiKeyBilling` on completion
- [ ] No upfront max-budget `recordBuyerApiKeyUsage` without final capture
- [ ] New/updated test passes
- [ ] `plans/README.md` updated

## STOP conditions

- `streamChatCompletionResponse` cannot access terminal raid cost — report architecture blocker.
- Streaming and buffered cost sources differ materially — document and align before capture.

## Maintenance notes

- Plan 011 touches same payment module; land this plan first.
- Reviewers: compare streaming vs buffered `bossraid` metadata parity.
