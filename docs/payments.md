# Payments

Closed-loop payment system for Boss Raid platform.

## Architecture

```
Client Request
      │
      ▼
x402 Payment (budget + 1% markup via PayAI facilitator)
      │
      ├─► Platform treasury wallet (BOSSRAID_X402_PAY_TO = cold storage)
      │         1% markup kept as platform revenue
      │
      └─► Escrow funding (budget minus markup)
                │
                ▼
            Raid executes
                │
                ▼
            Mercenary evaluates — invalid = no payout
                │
                ▼
            Approved providers split escrow equally
                │
                ▼
            Each provider paid onchain to registered wallet
```

## Key Concepts

- **Client pays via x402** - No crypto required by clients. They pay the facilitator (PayAI/CDP).
- **Platform keeps 1%** - Markup goes to cold storage treasury.
- **Escrow funded from treasury** - Platform pays providers from a separate hot wallet.
- **Equal split** - Approved providers split escrow equally (renamed from "winner").
- **Minimum payout** - $0.25 threshold to avoid dust payouts.

## Environment Variables

| Variable | Description | Required |
|----------|------------|----------|
| `BOSSRAID_X402_PAY_TO` | Cold storage wallet (platform revenue) | Yes |
| `BOSSRAID_X402_PLATFORM_MARKUP_BPS` | Basis points markup (100 = 1%) | Yes (default 100) |
| `PAYAI_API_KEY_ID` | PayAI facilitator API key | Yes |
| `PAYAI_API_KEY_SECRET` | PayAI facilitator API secret | Yes |
| `BOSSRAID_X402_FACILITATOR_FALLBACK` | Enable CDP fallback | No |
| `CDP_API_KEY_ID` | CDP fallback API key | No (if fallback enabled) |
| `CDP_API_KEY_SECRET` | CDP fallback API secret | No (if fallback enabled) |
| `BOSSRAID_SETTLEMENT_TREASURY_KEY` | Private key for onchain payouts (hot wallet). Falls back to `BOSSRAID_CLIENT_PRIVATE_KEY` for backward compatibility. | Yes |
| `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD` | Minimum payout threshold | Yes (default 0.25) |

## Payment Flow

1. **Client requests raid** with budget
2. **API builds x402 payment requirement** - budget + surcharge + 1% markup
3. **Client pays via facilitator** (PayAI or CDP)
4. **Platform stores payment amounts**:
   - `x402PaidAmountUsd` - total paid
   - `escrowFundingUsd` - amount for provider payouts
   - `platformMarkupUsd` - platform cut
5. **Raid executes** with providers
6. **Mercenary evaluates** - invalid submissions get $0
7. **Approved providers split escrow** - equally, minimum $0.25
8. **Onchain settlement** - payout to provider wallets

## Settlement

- Uses `escrowFundingUsd` (actual paid amount) not `maxBudgetUsd` (requested budget)
- Minimum payout threshold prevents dust transactions
- Invalid submissions receive $0
- Equal split among approved providers

## Facilitators

- **PayAI** (primary) - `https://facilitator.payai.network`
- **CDP** (fallback) - `https://api.cdp.coinbase.com/platform/v2/x402`

Set `BOSSRAID_X402_FACILITATOR_FALLBACK=true` to enable CDP fallback.

## Removed

- HMAC fallback - No more local payment verification
- `BOSSRAID_X402_VERIFY_HMAC_SECRET` - Deprecated