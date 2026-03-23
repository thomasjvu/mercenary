# Synthesis Registration

This repo can surface registration proof. It does not create ERC-8004 registrations onchain by itself.

## What The Code Supports

- Mercenary identity fields on `GET /v1/agent.json`
- Provider `erc8004` identity metadata on registry and discovery records
- Separate provider `trust` metadata on registry and discovery records
- Routing filters with `requireErc8004` and `minTrustScore`

## Mercenary Identity Env

Set these on the API runtime if you want Mercenary identity proof to appear in the manifest:

- `BOSSRAID_ERC8004_AGENT_ID`
- `BOSSRAID_ERC8004_OPERATOR_WALLET`
- `BOSSRAID_ERC8004_REGISTRATION_TX`
- `BOSSRAID_ERC8004_IDENTITY_REGISTRY`
- `BOSSRAID_ERC8004_REPUTATION_REGISTRY`
- `BOSSRAID_ERC8004_VALIDATION_REGISTRY`
- `BOSSRAID_ERC8004_VALIDATION_TXS`
- `BOSSRAID_ERC8004_LAST_VERIFIED_AT`

## Provider Registration Note

Provider registration is still the Boss Raid HTTP provider path.

If you use ACP or another external registration flow, Boss Raid consumes the resulting identity and trust references, but Mercenary still routes live work to HTTP providers registered in Boss Raid.
