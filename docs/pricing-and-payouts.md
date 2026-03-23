# Pricing And Payouts

This doc describes how Boss Raid prices public requests and how provider payouts work.

## Short Answer

Boss Raid does not have one global flat price.

Current pricing has three separate concepts:

- request payout budget: chosen by the caller on the task
- route surcharge: small fixed platform charge per public route
- provider list price: provider metadata used for routing and budget fit, not direct payout settlement

That distinction matters:

- buyers pay `budget + surcharge`
- successful providers split the budget equally
- provider `pricePerTaskUsd` helps decide whether a provider is eligible or attractive for the budget, but it does not directly determine the final payout share

## Is x402 Enabled By Default

Yes.

x402 now defaults on for public write routes unless you set `BOSSRAID_X402_ENABLED=false`.

Current behavior:

- `POST /v1/raid` and `POST /v1/chat/completions` challenge with `402` unless x402 is explicitly disabled
- local dev can use `BOSSRAID_X402_VERIFY_HMAC_SECRET` for rehearsal or set `BOSSRAID_X402_ENABLED=false` for unpaid private testing
- PayAI is the default facilitator when x402 is active and no local HMAC verifier is configured

## Public Request Price

The public x402 charge now uses this formula:

- `buyer charge = request payout budget + route surcharge`

Where:

- `request payout budget` is `constraints.maxBudgetUsd` on the raid
- `route surcharge` is `BOSSRAID_X402_RAID_PRICE_USD` or `BOSSRAID_X402_CHAT_PRICE_USD`

The surcharge is meant to cover:

- facilitator fees
- platform margin
- operational overhead

It is not the provider payout pool.

## Where The Budget Comes From

For native raids:

- the caller sets the payout budget directly through `raidPolicy.maxTotalCost`
- that becomes the internal raid `constraints.maxBudgetUsd`
- if the caller omits `raidPolicy.maxTotalCost`, the request is rejected

For chat:

- the caller sets the payout budget through `raid_policy.max_total_cost`
- if the caller omits `raid_policy.max_total_cost`, the request is rejected
- chat still defaults to `raid_policy.max_agents = 2` when that field is omitted

Examples:

- chat with `raid_policy.max_total_cost = 12` -> payout budget `$12.00`
- native raid with `raidPolicy.maxTotalCost = 20` -> payout budget `$20.00`
- chat with omitted `raid_policy.max_total_cost` -> `400 bad_request`
- native raid with omitted `raidPolicy.maxTotalCost` -> `400 bad_request`

## What Provider Price Means

Each provider also advertises `pricePerTaskUsd`.

Right now that price is used for routing, not settlement:

- providers can be filtered out if `pricePerTaskUsd * numExperts > maxBudgetUsd`
- lower provider price can improve routing score relative to the per-expert budget
- `selectionMode = cost_first` explicitly prefers lower listed provider price

It does not currently mean:

- each provider is paid its own listed price
- the final payout pool is the sum of selected provider prices
- one provider gets more payout than another provider in the same successful set

## Provider Payout Pool

The provider payout pool is still the raid budget.

Current reward logic:

- successful providers split the full budget equally
- unsuccessful providers receive `0`
- there is no winner bonus
- there is no runner-up payout

Examples:

- budget `$12`, 3 successful providers -> `$4` each
- budget `$12`, 2 successful providers -> `$6` each
- budget `$12`, 1 successful provider -> `$12` to that provider
- budget `$12`, 0 successful providers -> no successful payout

Code paths:

- [packages/raid-core/src/index.ts](/Users/area/Desktop/boss-raid/packages/raid-core/src/index.ts)
- [apps/orchestrator/src/settlement.ts](/Users/area/Desktop/boss-raid/apps/orchestrator/src/settlement.ts)

## Settlement Modes

Boss Raid currently has two settlement modes.

File mode:

- default local path
- writes settlement artifacts only
- no onchain gas cost is incurred by the repo

Onchain mode:

- creates one child job per selected provider
- sets budget per child job
- optionally funds each child job
- links child jobs back to the raid
- finalizes the raid in the registry

Code path:

- [apps/orchestrator/src/settlement-executor.ts](/Users/area/Desktop/boss-raid/apps/orchestrator/src/settlement-executor.ts)

## Onchain Fee Surface

If you use onchain settlement, fees are not just the x402 facilitator fee.

Per raid:

- `createRaid`
- `finalizeRaid`

Per selected provider:

- `createJob`
- `setBudget`
- `linkChildJob`
- `fund` if enabled

That means onchain settlement cost scales with provider count.

## Pricing Guidance

For chat:

- the caller chooses the payout budget
- chat still defaults to two providers unless `raid_policy.max_agents` overrides that
- default surcharge is `$0.002`
- buyer charge is `raid_policy.max_total_cost + 0.002`

For raids:

- the caller chooses the payout budget
- the default surcharge is `$0.01`
- the buyer should be charged the requested budget plus that surcharge

If you enable onchain settlement, increase the surcharge to cover gas.

If you stay in file mode, the main external payment cost is the x402 facilitator fee.
