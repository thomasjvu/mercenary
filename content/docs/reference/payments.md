# Payments

x402 in, escrow out, equal split to successful providers.

**Single money rail:** **Robinhood Chain** (`eip155:4663`) + **USDG** via the **Marian** x402 facilitator (Surplus / Alkahest). Base USDC / PayAI are not supported.

Follow the flow diagram first, then use the fee and payout tables when wiring billing or seller expectations.

## Flow

```
Client → x402 USDG on Robinhood (budget + surcharge + markup) or buyer API key balance
      → treasury (platform cut)
      → ledger credit every success
      → on-chain USDG transfer when seller balance ≥ BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD ($1 default)
      → approved providers split equally (multi-agent)
```

## Chain

| Field       | Production                                        | Notes                                                               |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Network     | `eip155:4663` (Robinhood mainnet)                 | Testnet `eip155:46630` for contract rehearsal only                  |
| RPC         | `https://rpc.mainnet.chain.robinhood.com`         | Public rate-limited; Alchemy optional for prod throughput           |
| Asset       | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | EIP-712 name `Global Dollar` / version `1`; 6 decimals              |
| Facilitator | Marian URL (`BOSSRAID_X402_FACILITATOR_URL`)      | Required when x402 is enabled                                       |
| Escrow      | `BossJobEscrow` + `BossBountyEscrow` + registry   | Deploy via `pnpm bossraid deploy:contracts`; see packages/contracts |

Testnet has **no official USDG** — use `pnpm bossraid deploy:contracts:testnet` (mintable TestUSDG). Never copy testnet addresses into production.

## Fees (buyers)

Buyers pay the reserved seller rate plus route surcharges and platform markup. Settlement uses the immutable quote snapshot, not the requested budget cap.

| Path                         | How you pay                                                                           | Markup                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Wallet / x402**            | Marian settles **USDG on Robinhood** when `BOSSRAID_X402_ENABLED=true`.               | Default **1%** platform markup (`BOSSRAID_X402_PLATFORM_MARKUP_BPS=100`) |
| **Buyer API key** (`br_...`) | Skips x402 challenge; debits key spend cap and/or prepaid balance on the same request | Same markup rules apply to the underlying charge                         |

**Charge formula:** reserved seller budget + route surcharge + platform markup.

Route surcharges (not model price): `BOSSRAID_X402_RAID_SURCHARGE_USD`, `BOSSRAID_X402_CHAT_SURCHARGE_USD`.

Buyer setup: [buy.md](../buyers/buy.md). Mercenary wallet vs API key controls: [raids.md](../raiders/raids.md).

## Payouts (sellers)

- **Split rule (multi-agent):** successful providers split escrow **equally**. No winner/runner-up logic.
- **Discount inference:** single selected seller; settlement budget is capped to the provider’s declared rate. Floor **$0.01**. See [discount-inference.md](../buyers/discount-inference.md).
- **Invalid work:** rejected or failed providers get **$0**.
- **On-chain transfer floor:** `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD` defaults to **$1** so small earnings batch before USDG is sent on-chain. The seller **ledger still credits every successful call**.
- **Inference ledger floor:** single-provider discount inference uses **$0.01** for automatic ledger credit (`INFERENCE_SETTLEMENT_MIN_PAYOUT_USD`).
- **Settlement mode:** sync chat/inference responses wait for settlement when `BOSSRAID_SETTLEMENT_MODE` is `file` or `onchain`.

Seller earnings: `GET /v1/seller/earnings` (includes `pendingUsd`, `settledUsd`, `flushEligible`).  
Batch flush when pending ≥ floor: `POST /v1/seller/payouts/flush` — with `BOSSRAID_RPC_URL` + `BOSSRAID_SETTLEMENT_TREASURY_KEY` this **sends USDG** on Robinhood then marks ledger settled. Optional body `txHash` marks ledger only. Offer setup: [sell.md](../sellers/sell.md).

After x402 `/settle`, production requires **on-chain receipt verification** (USDG `Transfer` to `payTo` ≥ charged amount) when `BOSSRAID_RPC_URL` is set (always required in `NODE_ENV=production`).

## Rules

- Clients pay via Marian facilitator (USDG on Robinhood).
- Buyer API keys (`br_...`) skip x402 and debit spend caps / prepaid balance in the same request.
- Platform markup defaults to 1% (`BOSSRAID_X402_PLATFORM_MARKUP_BPS=100`).
- Successful providers split escrow equally. Invalid work gets $0.
- **Closed-loop refund policy:** abort / cancel before terminal, spawn failure, and **zero successful providers** release the API-key hold and attempt x402/mana refund. Buyer is charged only for successful provider payouts (capped by reserved escrow). Platform markup is retained only on captured success, not on failed work.
- On-chain payout floor: `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD` (default **`1`**). Ledger accrues below that.
- Single-provider discount inference uses a `0.01` **ledger** floor so marketplace calls still settle automatically in books.
- Settlement uses paid escrow, not requested budget cap.
- Sync chat/inference responses wait for settlement execution when `BOSSRAID_SETTLEMENT_MODE` is `file` or `onchain`.
- Client disconnect mid-stream does not yet auto-abort (known gap); prefer explicit abort or short `maxLatencySec`.

## Key env

| Variable                             | Required | Notes                                                    |
| ------------------------------------ | -------- | -------------------------------------------------------- |
| `BOSSRAID_X402_PAY_TO`               | Yes      | Treasury wallet on Robinhood                             |
| `BOSSRAID_X402_NETWORK`              | Yes      | `eip155:4663`                                            |
| `BOSSRAID_X402_ASSET`                | Yes      | `usdg` (or USDG address)                                 |
| `BOSSRAID_X402_FACILITATOR_URL`      | Yes      | Marian base URL                                          |
| `BOSSRAID_X402_PLATFORM_MARKUP_BPS`  | Yes      | Default 100                                              |
| `BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD` | Yes      | On-chain flush floor (default `1`)                       |
| `BOSSRAID_SETTLEMENT_TREASURY_KEY`   | Yes      | Hot wallet for seller USDG payouts                       |
| `BOSSRAID_SETTLEMENT_FUND_JOBS`      | Yes      | Fund escrow jobs onchain (`true` for production payouts) |

For production onchain payouts, fund the settlement treasury with **USDG on Robinhood** and align it with `BOSSRAID_X402_PAY_TO` (same hot wallet) or keep the treasury pre-funded.

Route surcharges (not model price): `BOSSRAID_X402_RAID_SURCHARGE_USD`, `BOSSRAID_X402_CHAT_SURCHARGE_USD`.

## Enable payments

1. Point `BOSSRAID_X402_FACILITATOR_URL` at Marian (Surplus x402 facilitator for RH USDG)
2. Set network `eip155:4663`, asset `usdg`, treasury `BOSSRAID_X402_PAY_TO`
3. `BOSSRAID_X402_ENABLED=true` on boot, or toggle in ops (`PATCH /v1/ops/settings`)

x402 defaults to **off** until explicitly enabled.

**Phala production env (bossraid-main):** deploy secrets already set Marian + Robinhood USDG when assembled correctly:

- `BOSSRAID_X402_ENABLED=true`
- `BOSSRAID_X402_NETWORK=eip155:4663`
- `BOSSRAID_X402_ASSET=usdg`
- `BOSSRAID_X402_FACILITATOR_URL=https://marian.maid.fyi` (or current Marian URL)
- `BOSSRAID_X402_PAY_TO=<treasury>`

Confirm with ops `GET /v1/ops/settings` / production-readiness after deploy — do not assume live without checking.

## Real paid traffic checklist (not a ledger demo)

Without these, sellers only accrue **ledger credits** and cannot cash out USDG:

1. Fund `BOSSRAID_X402_PAY_TO` with USDG on Robinhood (real Marian settles or verified top-ups)
2. Enable x402 for public wallet buyers (or fund `br_` prepaid via verified x402)
3. `BOSSRAID_RPC_URL` (Robinhood) for settle verify + flush
4. `BOSSRAID_SETTLEMENT_TREASURY_KEY` (or client key) funded with USDG + gas
5. `GET /v1/ops/production-readiness` → includes `settlement_treasury_flush: pass`
6. Successful inference → `GET /v1/seller/earnings` shows `pendingUsd`
7. `POST /v1/seller/payouts/flush` returns `mode: "onchain"` + real `txHash` (not `ledger_only`)

`NODE_ENV=production` refuses client-supplied `txHash` and refuses flush without treasury config.

## Surplus Intelligence parity

Alkahest (Surplus) uses Mana ledger + Reown top-ups in **USDG on Robinhood**, and Marian for agent x402. Boss Raid mirrors that **chain/asset** for marketplace payments: prepaid `br_` balance still works; wallet challenges settle USDG via Marian.

## Buyer API keys

Valid `br_` keys skip the x402 challenge. Spend debits key cap and/or prepaid balance.

See [Buy inference](../buyers/buy.md) for buyer setup.
