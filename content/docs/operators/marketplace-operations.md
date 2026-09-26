# Marketplace operations

## Read live market state

`GET /v1/models` and `GET /v1/markets` merge runtime seller offers with the static model catalog. Catalog rows have `providerCount: 0` and `activeProviderCount: 0`; they are discovery references, not supply. Use successful API responses to report live liquidity.

```bash
API=https://api.raid.quest

# Runtime counters backed by registered provider profiles and the seller ledger.
curl --fail-with-body --silent --show-error "$API/v1/marketplace/stats" | jq

# Live seller rows plus a count of catalog-only rows, kept separate.
curl --fail-with-body --silent --show-error "$API/v1/markets" | jq '{
  stats,
  liveMarkets: [.data[] | select((.activeProviderCount // 0) > 0) | {
    modelId,
    activeProviderCount,
    sellers: [.sellers[] | select(.status == "available" and (.marketplaceOfferStatus // "active") == "active") | {
      sellerId,
      rateUsd,
      pricing
    }]
  }],
  catalogOnlyRows: [.data[] | select((.providerCount // 0) == 0) | .modelId]
}'
```

`modelsLive` counts distinct model IDs with at least one currently available active inference offer. `activeOffers` counts those offers. `sellerOffersActive` counts profiles declaring an active offer, including unavailable profiles. `routedRequests24h` counts distinct raid IDs in the latest 10,000 payout rows for currently registered providers, so one multi-provider raid counts once. `earnedBySellers24hUsd` sums those seller payout ledger rows; it is ledger activity, not a chain-indexed total. These counters are not static catalog sizes.

For a filtered order book, pass supported query parameters such as `model_id`, `model_provider`, `privacy_mode`, `verification_status`, or `max_budget_usd` to `/v1/markets`. The response's top-level stats remain global; the filtered `data` array is only the matching view.

## API outage handling

On **2026-09-26 at 13:29 UTC**, live requests to `https://api.raid.quest/v1/markets`, `https://api.raid.quest/v1/marketplace/stats`, and the web proxy at `https://raid.quest/api/v1/markets` returned Cloudflare **525 (SSL handshake failed)**. No market, seller, or stats payload was returned, so live supply and activity were **unknown**. The page's zero-valued placeholders at that time were not live API measurements.

After an origin or TLS change, check the API process and readiness from the host, then check the public edge:

```bash
curl --include --fail-with-body http://127.0.0.1:8787/health
curl --include --fail-with-body http://127.0.0.1:8787/ready
curl --include --fail-with-body https://api.raid.quest/v1/marketplace/stats
curl --include --fail-with-body https://api.raid.quest/v1/markets
curl --include --fail-with-body https://raid.quest/api/v1/markets
```

If the local API responds but the public API returns 525, inspect the Cloudflare origin target, port, TLS mode, certificate chain and hostname/SNI, plus the Phala service's public TLS listener. A 525 is an edge-to-origin TLS failure; provider/catalog counts cannot diagnose it. Once restored, confirm the public stats and market responses include seller rows and compare `modelsLive` to the number of markets with `activeProviderCount > 0`.

## Production gates still apply

Public endpoint reachability is not a production settlement sign-off. Before enabling unrestricted paid traffic, require `GET /v1/ops/production-readiness` with `ok: true`, a successful x402/Marian end-to-end payment, funded Robinhood USDG settlement wallets, active ready sellers, and the documented onchain settlement cutover. Keep mainnet funding and deployment as explicit operator actions.
