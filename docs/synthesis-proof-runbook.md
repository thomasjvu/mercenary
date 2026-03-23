# Synthesis Proof Runbook

Use this runbook to produce one submission-grade proof lane:

1. real ERC-8183-aligned settlement txs
2. real ERC-8004 registration references
3. one strict-private Venice raid with a public receipt

## Scope

This repo can execute the ERC-8183-aligned settlement path today.

This repo does not currently create ERC-8004 registrations onchain. For ERC-8004, use a real external registration flow, then feed the resulting references into Mercenary and provider registration metadata so the receipt can show real tx hashes.

## Recommended Demo Chain

- Base Sepolia for full rehearsal
- Base mainnet only after the receipt and explorer proof look correct on Sepolia

For the final lane:

- `BOSSRAID_CHAIN_ID=8453`
- `BOSSRAID_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<key>` or another Base mainnet RPC

Do not commit live RPC keys or private keys into the repo.

## RPC vs x402

x402 and onchain settlement are separate.

- x402 does not require `BOSSRAID_RPC_URL`
- x402 needs the x402 env set, especially `BOSSRAID_X402_NETWORK`, `BOSSRAID_X402_ASSET`, `BOSSRAID_X402_PAY_TO`, and facilitator credentials
- `BOSSRAID_RPC_URL` is required for `pnpm deploy:contracts` and `BOSSRAID_SETTLEMENT_MODE=onchain`

If your goal is "paid requests only", x402 is enough.

If your goal is "explorer-visible ERC-8183 settlement proof", you also need the RPC URL plus the settlement env.

## Inputs You Need First

- one deployer private key for contract deployment
- one funded client private key for the settlement payer
- one evaluator address
- one onchain address for each demo provider
- one real ERC-8004 registration tx for Mercenary
- one real ERC-8004 registration tx for each demo provider

Definitions:

- deployer private key: sends the contract deployment txs
- client private key: sends the parent-raid and child-job settlement txs
- evaluator address: the onchain address embedded into each child job as the evaluator allowed to judge or finalize that job
- provider address: the onchain address mapped to one provider id in `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`; child jobs are created against this address
- x402 pay-to address: the address that receives x402 payments; it can be different from the deployer, client, evaluator, or provider addresses

Wallet guidance:

- use dedicated hot wallets with small balances for the deployer and client because they must sign live txs
- use a dedicated hot wallet for the evaluator only if your evaluator flow will sign onchain during the demo
- use dedicated provider operator wallets for provider identities and onchain proof
- do not use a treasury or cold wallet as the demo deployer or settlement client
- `BOSSRAID_X402_PAY_TO` can point at a safer treasury or cold-controlled receive address if it only needs to receive funds and not sign demo txs

Use provider ids that match the live demo pool:

- `dottie`
- `riko`
- `gamma`

Reference file: [examples/provider-addresses.json](/Users/area/Desktop/boss-raid/examples/provider-addresses.json)

## Step 1: Deploy The Settlement Contracts

Run:

```bash
pnpm build

BOSSRAID_RPC_URL=https://sepolia.base.org \
BOSSRAID_CHAIN_ID=84532 \
BOSSRAID_DEPLOYER_PRIVATE_KEY=0x... \
BOSSRAID_TOKEN_ADDRESS=0x... \
pnpm deploy:contracts
```

Output:

- `temp/contracts/deployment.json`
- registry deploy tx hash
- escrow deploy tx hash

Keep:

- registry address
- escrow address
- deploy tx hashes

## Step 2: Bootstrap Settlement Env

Run:

```bash
pnpm bootstrap:settlement-env -- \
  --manifest temp/contracts/deployment.json \
  --provider-addresses examples/provider-addresses.json \
  --evaluator-address 0x...
```

Then edit the generated file and set:

```bash
BOSSRAID_CLIENT_PRIVATE_KEY=0x...
```

The generated env file should contain:

- `BOSSRAID_SETTLEMENT_MODE=onchain`
- `BOSSRAID_REGISTRY_ADDRESS=...`
- `BOSSRAID_ESCROW_ADDRESS=...`
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON=...`
- `BOSSRAID_EVALUATOR_ADDRESS=...`

Notes:

- `--evaluator-address` should be the address you want recorded on every child job as the evaluator
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON` must map each live provider id to its real onchain address
- use checksum addresses on Base mainnet

## Step 3: Wire Real ERC-8004 References

In practice, "ERC-8004 registry flow" means the concrete registry deployment and registration process you are using.

There is not one repo-native flow yet. This repo currently consumes real registration references after the fact.

## Recommended ERC-8004 Path For The Virtuals Track

If Virtuals is the primary target, ACP is the cleanest registration path.

Reason:

- ACP already gives each agent a smart wallet plus a whitelisted dev wallet
- Virtuals documents ACP as an onchain job system with agent wallets, settlement, evaluation, and review
- Virtuals states that registered ACP agents now receive ERC-8004 registration and synced identity or reputation state

Recommended mapping for Boss Raid:

- Boss Raid provider address: use the ACP Agent Wallet address for that provider
- ACP whitelisted dev wallet: keep this separate as the controller wallet that signs ACP actions
- `erc8004.agentId`: use the ERC-8004 agent id produced by ACP registration sync
- `erc8004.registrationTx`: use the ERC-8004 registration tx exposed by that ACP-backed flow
- `erc8004.identityRegistry`: use the ERC-8004 identity registry address from that same flow
- `erc8004.operatorWallet`: use the operator or agent wallet that the actual ERC-8004 record resolves to and keep it consistent across Mercenary, provider registration, and receipt proof

Practical rule:

- do not invent a second ERC-8004 path if ACP already gives you one
- use ACP for the Virtuals-facing registration story
- surface the resulting ERC-8004 references inside Boss Raid for the trust-proof story

Reference templates:

- [examples/base-mainnet-proof.env.example](/Users/area/Desktop/boss-raid/examples/base-mainnet-proof.env.example)
- [examples/provider-addresses.base-mainnet.json](/Users/area/Desktop/boss-raid/examples/provider-addresses.base-mainnet.json)
- [examples/provider-registration.base-mainnet.example.json](/Users/area/Desktop/boss-raid/examples/provider-registration.base-mainnet.example.json)
- [docs/virtuals-acp-bossraid-mapping.md](/Users/area/Desktop/boss-raid/docs/virtuals-acp-bossraid-mapping.md)
- [examples/virtuals-acp-capture-sheet.md](/Users/area/Desktop/boss-raid/examples/virtuals-acp-capture-sheet.md)

For the hackathon, pick one consistent Base deployment or service flow and use it for:

- Mercenary
- the Venice-backed demo provider
- at least one non-Venice comparison provider

Minimum fields that should be real:

- `agentId`
- `operatorWallet`
- `registrationTx`
- `identityRegistry`

If your chosen flow also emits them, add:

- `reputationRegistry`
- `validationRegistry`
- `validationTxs`

Mercenary manifest reads these env vars:

- `BOSSRAID_ERC8004_AGENT_ID`
- `BOSSRAID_ERC8004_OPERATOR_WALLET`
- `BOSSRAID_ERC8004_REGISTRATION_TX`
- `BOSSRAID_ERC8004_IDENTITY_REGISTRY`
- `BOSSRAID_ERC8004_REPUTATION_REGISTRY`
- `BOSSRAID_ERC8004_VALIDATION_REGISTRY`
- `BOSSRAID_ERC8004_VALIDATION_TXS`

Each provider registration should include:

- `erc8004.agentId`
- `erc8004.operatorWallet`
- `erc8004.registrationTx`
- optional registry and validation references

Reference shape: [examples/provider-registration.json](/Users/area/Desktop/boss-raid/examples/provider-registration.json)

Important:

- do not use placeholder hashes in the final demo
- use the real tx hash from the external ERC-8004 registration flow
- use the same wallet and registry references judges can inspect later
- do not mix multiple ERC-8004 registration flows across Mercenary and demo providers unless you can explain why

## Step 4: Register Demo Providers

Use the registry write route with real ERC-8004 fields. The Venice provider must stay `modelFamily: "venice"` and expose:

- `teeAttested`
- `e2ee`
- `noDataRetention`
- `signedOutputs`

Reference pool: [examples/providers.http.json](/Users/area/Desktop/boss-raid/examples/providers.http.json)

For the strict-private demo lane, ensure at least one eligible provider is both:

- Venice-backed
- ERC-8004-registered
- trust score `>= 80`

## Step 5: Run One Strict-Private Raid

Use:

- [examples/strict-private-raid.json](/Users/area/Desktop/boss-raid/examples/strict-private-raid.json)

Spawn:

```bash
curl -sS \
  -X POST http://127.0.0.1:8787/v1/raid \
  -H 'content-type: application/json' \
  --data @examples/strict-private-raid.json
```

Keep:

- `raidId`
- `raidAccessToken`
- `receiptPath`

The result must show:

- `routingProof.policy.venicePrivateLane=true`
- `routingProof.policy.requireErc8004=true`
- routed providers with real `registrationTx`
- Venice-backed routed providers

## Step 6: Settle The Parent Raid Onchain

Source the settlement env file, then run:

```bash
pnpm settle:raid -- --raid-id <raidId>
```

The resulting receipt should include:

- `settlementExecution.mode="onchain"`
- `settlementExecution.proofStandard="erc8183_aligned"`
- `settlementExecution.registryRaidRef`
- `settlementExecution.transactionHashes`
- `settlementExecution.childJobs[]`

## Step 7: Capture Public Proof

Open:

- `/receipt?raidId=<raidId>&token=<raidAccessToken>`
- `GET /v1/raids/<raidId>/agent_log.json?token=<raidAccessToken>`
- `GET /v1/raid/<raidId>/attested-result`

The final proof set should show:

- Venice strict-private lane requested and satisfied
- ERC-8004 registration references on routed providers
- ERC-8183 child-job settlement plus finalization txs
- attested final result

## What To Say In The Demo

- "This raid required strict privacy, so Mercenary preferred Venice-backed providers."
- "This receipt shows why each provider was routed, including ERC-8004 registration and trust references."
- "This settlement path created child jobs and finalized the parent raid onchain."
- "The public proof is shareable, but the sensitive task context stayed in the private lane."

## Current Repo Gap

ERC-8004 registration itself is not created by this repo yet.

To make ERC-8004 fully native here, the next engineering task is:

- add a registration helper or adapter for the chosen ERC-8004 registry flow
- capture the returned tx hashes directly into Mercenary and provider registration state
