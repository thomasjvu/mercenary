# Synthesis Registration

This repo can surface registration proof. It does not create ERC-8004 registrations onchain by itself.

## What The Code Supports

- Mercenary identity fields on `GET /v1/agent.json`
- Provider `erc8004` identity metadata on registry and discovery records
- Optional ERC-8004 verification against chain data when `BOSSRAID_ERC8004_VERIFY` is enabled
- Routing proof snapshots that preserve ERC-8004 verification state, registry refs, and tx ownership checks when known
- Separate provider `trust` metadata on registry and discovery records
- Routing filters with `requireErc8004` and `minTrustScore`

## Track Positioning

For Protocol Labs and Virtuals, the honest story is:

- Boss Raid can already consume real ERC-8004 references for Mercenary and providers.
- Those fields already matter at runtime because routing can require ERC-8004 presence and minimum trust.
- The public proof surfaces already expose the resulting manifest, routing proof, receipt, and run log, and they now distinguish registered vs verified vs partial or failed ERC-8004 state.
- The missing piece is registration origination, not proof display. Real ERC-8004 tx refs still need to come from ACP or another external registration flow.
- When real chain data is available, Boss Raid can now verify owner, `tokenURI`, registry contract reachability, and registration tx presence before exposing those proofs.

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
- `BOSSRAID_ERC8004_VERIFY`

## Verification Rule

If you want the repo to prove that the ERC-8004 data is real instead of merely present, all of these need to be true:

- `BOSSRAID_ERC8004_VERIFY=true`
- `BOSSRAID_RPC_URL` points at the target chain
- `BOSSRAID_CHAIN_ID` matches that chain
- `erc8004.agentId` is the numeric ERC-721 token id, not a demo label
- the registry and transaction hash fields point at real deployed contracts and real txs

## Provider Registration Note

Provider registration is still the Boss Raid HTTP provider path.

If you use ACP or another external registration flow, Boss Raid consumes the resulting identity and trust references, but Mercenary still routes live work to HTTP providers registered in Boss Raid.

If that external flow already verified ERC-8004 onchain state, `POST /agents/register` can now accept an `erc8004.verification` object so Boss Raid does not have to rely only on raw registry addresses and tx hashes.

## ACP Integration Workflow

ERC-8004 identity registration and ERC-8183 settlement are handled through the Virtuals ACP platform. No self-deployed identity contracts are needed.

### Step 1: ACP Registration

1. Go to `https://acpx.virtuals.io` and register each agent:
   - **Mercenary** (orchestrator) — one registration
   - **Gamma** (provider) — one registration
   - **Riko** (provider) — one registration
   - **Dottie** (provider) — one registration
2. For each registration, record the output from the capture sheet:
   - ACP entity ID
   - ACP agent wallet address
   - ERC-8004 agent ID (numeric token id)
   - ERC-8004 registration transaction hash
   - ERC-8004 identity registry address

### Step 2: Map to Boss Raid Env

Use `examples/virtuals-acp-capture-sheet.md` as a guide. Map the ACP output:

**Mercenary env vars** (API container):
```
BOSSRAID_ERC8004_AGENT_ID=<numeric-token-id>
BOSSRAID_ERC8004_OPERATOR_WALLET=<acp-agent-wallet>
BOSSRAID_ERC8004_REGISTRATION_TX=<registration-tx-hash>
BOSSRAID_ERC8004_IDENTITY_REGISTRY=<identity-registry-address>
```

**Provider registration payload** (via `POST /agents/register`):
```json
{
  "agentId": "<provider-id>",
  "name": "<provider-name>",
  "erc8004": {
    "agentId": "<numeric-token-id>",
    "operatorWallet": "<acp-agent-wallet>",
    "registrationTx": "<registration-tx-hash>",
    "identityRegistry": "<identity-registry-address>",
    "verification": {
      "status": "verified",
      "checkedAt": "<iso-timestamp>"
    }
  }
}
```

### Step 3: ERC-8183 Settlement Addresses

Provider wallet addresses from ACP become the onchain addresses in settlement:

```
BOSSRAID_PROVIDER_ADDRESS_MAP_JSON='{"gamma":"0x...","riko":"0x...","dottie":"0x..."}'
BOSSRAID_EVALUATOR_ADDRESS=<evaluator-wallet>
BOSSRAID_CLIENT_PRIVATE_KEY=<client-wallet-with-usdc>
```

### Step 4: Composer

Add all env vars to `deploy/phala/docker-compose.yml` via `deploy/phala/production.env.example`. The compose forwards ERC-8004, settlement, and x402 env vars into the API container.

## Final-Lane Rule

Do not claim a final ERC-8004 lane unless these are real:

- Mercenary numeric `agentId`
- Mercenary `registrationTx`
- provider numeric `erc8004.agentId`
- provider `erc8004.registrationTx`
- the registry addresses judges can inspect later

Use the external flow to obtain those values, then feed them into the Boss Raid env and provider records so the manifest, receipt, and run log all tell the same story.
