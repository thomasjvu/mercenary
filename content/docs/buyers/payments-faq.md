# Payments FAQ — what happens to the money?

Short answers for buyers and sellers when a request succeeds, fails, is cancelled, or never finishes.

See also: [payments.md](../reference/payments.md), [buy.md](buy.md), [bounties.md](bounties.md), [sell.md](../sellers/sell.md).

## How can I see what was charged or refunded?

| Who        | Where                                                                | What you see                                                                                                             |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Buyer**  | `GET /v1/buyer/purchases` and **Account → buyer → billing activity** | Rows with `status`: `charged`, `hold_released`, or `refunded`, plus `reason`, `costUsd` / `reservedUsd`, `raidId`, route |
| **Buyer**  | `GET /v1/buyer/balance`                                              | Prepaid balance after holds and releases                                                                                 |
| **Buyer**  | Response `bossraid` on chat/inference                                | `paid_price_usd`, receipt path; on cancel/zero-success stream: `billing_status`                                          |
| **Seller** | `GET /v1/seller/earnings` and **Sell / Account → seller**            | Accrued / settled payouts per `raidId` with `status` and optional `txHash`                                               |
| **Either** | Raid receipt / verification                                          | Work outcome; money detail is on account APIs above                                                                      |

**Important:** successful work creates a **charged** purchase and a **seller payout** row. Abort / zero-success / timeout creates a **hold_released** or **refunded** buyer row and **no** seller credit.

---

## Chat, raid, and discount inference

### What do I pay when a request succeeds?

You pay the settlement amount for **successful** providers only (capped by your reserved budget / max price), plus documented route surcharge and platform markup on the charged amount. Sellers who failed validation get **$0**. Multi-agent successes **split the paid pool equally** (no winner/runner-up).

### What if the job is cancelled or aborted?

| Who cancelled                         | Buyer money                                                                       | Seller money | Platform                      |
| ------------------------------------- | --------------------------------------------------------------------------------- | ------------ | ----------------------------- |
| You (or client disconnect mid-stream) | **Full release** of prepaid hold; x402 refund attempted when settle had succeeded | $0           | No markup kept on failed work |
| Ops/admin `POST /v1/raid/:id/abort`   | Same full release / refund path                                                   | $0           | Same                          |
| Spawn fails before work starts        | Full release / refund                                                             | $0           | $0                            |

Buyer activity shows `status: hold_released` or `refunded` with a reason such as `raid_aborted` or `client_disconnect_or_abort`.

### What if nobody succeeds (all providers fail / invalid)?

**Full refund / hold release.** You are **not** charged the reserved budget for zero successful providers. Activity: `zero_success_refund` (or capture `0` → hold released). Sellers get **no** ledger credit.

### What if I run out of prepaid balance or hit the spend cap?

Reserve happens **before** spawn. Insufficient balance or cap → **402** (or clear error); **no work**, **no charge**. Concurrent requests each reserve full budget — a second request can fail while the first holds funds.

### What if the stream disconnects mid-response?

The API **aborts the raid** and runs the same refund path as cancel. You should see a hold release / refund on billing activity. Prefer short `maxLatencySec` if clients often drop.

### What if payment settled (x402) but the API crashed before work finished?

Reservation markers + refund reconciliation queue aim to avoid double-charge. Failed automatic refunds enqueue for retry (`spawn_refund`). Check purchases for `refunded` with reason `…:queued:…` if the facilitator is slow.

### Wallet x402 vs API key (`br_…`)

|                             | **API key + prepaid**                                 | **x402 wallet**                                        |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Hold                        | Debit balance / spend up front                        | Marian settle to treasury                              |
| Success                     | Capture actual ≤ reserved; unused returned to balance | Escrow already paid; sellers paid from treasury/ledger |
| Fail / abort / zero-success | Release hold → balance restored                       | Facilitator **refund** (or queued)                     |
| Visibility                  | Purchase rows on account                              | Same rows when refund path runs; chain tx on settle    |

---

## Bounties (BossBountyEscrow)

Bounties are a **separate** escrow rail (onchain USDG when settlement mode is onchain).

| Event                                          | Poster (buyer)                                       | Provider (seller)                                       |
| ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Fund bounty                                    | Tokens locked in escrow                              | —                                                       |
| Award                                          | Budget locked to award amount                        | —                                                       |
| Deliver + accept / claim after accept deadline | —                                                    | Gets award amount (claim pays **provider**, not caller) |
| No delivery past delivery deadline             | Forfeit returns award to remaining → refund leftover | $0 for that award                                       |
| Leftover unallocated after award window        | `refundUnawarded` → poster                           | Locked awards untouched                                 |
| Poster “cancel anytime” mid-window             | **Not supported** — recovery is deadline-gated       | —                                                       |

See [bounties.md](bounties.md) and operator recovery notes in [runtime.md](../operators/runtime.md).

---

## Job escrow (raid child jobs onchain)

| Event                                  | Client                    | Provider |
| -------------------------------------- | ------------------------- | -------- |
| Fund job                               | Budget in `BossJobEscrow` | —        |
| Complete (evaluator) before expiry     | —                         | Paid     |
| Reject                                 | Refunded                  | $0       |
| Expiry without complete                | `claimRefund`             | $0       |
| Double complete / claim after complete | Reverts                   | —        |

---

## Seller payout questions

### When do I get paid?

Only for **valid successful** work. Ledger credits every success; on-chain USDG flush when pending ≥ `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD` (default $1) via `POST /v1/seller/payouts/flush`.

### Cancelled buyer job — do I still get paid?

**No.** Cancel / abort / zero-success does not create a seller payout row.

### Flush failed — did I lose the money?

Rows stay **`accrued`** (or return from `flushing`) so you can flush again. Check `GET /v1/seller/earnings` statuses: `accrued` | `flushing` | `settled` | `failed`.

---

## Platform fees

- Default markup **1%** (`BOSSRAID_X402_PLATFORM_MARKUP_BPS=100`) on charged amount.
- Route surcharges are separate env knobs (chat/raid).
- Markup is **not** kept on aborted / zero-success work under the closed-loop refund policy.

---

## Edge cases (checklist)

| Edge                                             | Outcome                                                         |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Double accept / double claim (bounty)            | Second call reverts                                             |
| Stranger claims bounty payout                    | Tokens go to **provider**, not stranger                         |
| Stranger triggers leftover refund                | Tokens go to **poster**                                         |
| Over-award sum &gt; budget                       | Reverts                                                         |
| Donation to escrow contract                      | Does not inflate payouts                                        |
| Partial multi-award leftover                     | Unallocated refundable after award deadline; locked awards stay |
| Capture fails after sellers already paid onchain | No second buyer charge; ops recon if needed                     |
| Client disconnect mid-SSE                        | Abort + hold release / refund                                   |
| Sub-floor seller pending                         | Ledger holds until flush floor                                  |

---

## API quick ref

```bash
# Buyer activity (charges + releases + refunds)
curl -b cookies.txt 'http://127.0.0.1:8787/v1/buyer/purchases?limit=50'

# Buyer prepaid balance
curl -b cookies.txt http://127.0.0.1:8787/v1/buyer/balance

# Seller earnings
curl -b cookies.txt http://127.0.0.1:8787/v1/seller/earnings

# Abort a raid (admin)
curl -X POST -H "authorization: Bearer $BOSSRAID_ADMIN_TOKEN" \
  http://127.0.0.1:8787/v1/raid/<raidId>/abort
```

Account UI: `/account` (buyer billing activity + seller earnings).
