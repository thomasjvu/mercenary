# Base Mainnet Demo Checklist

Use this as the operator runbook for the final Synthesis lane.

## What Your Team Needs To Do

There are four separate systems in play:

1. Virtuals ACP registration
2. Boss Raid provider registration
3. Boss Raid onchain settlement deployment
4. Venice-backed provider runtime

Do not treat one system as automatically configuring the others.

Execution truth:

- Mercenary is the orchestrator
- the live demo execution lane is the Boss Raid HTTP provider registry and `POST /v1/raid`
- ACP is the registration, wallet, identity, and marketplace lane unless you add a direct ACP bridge

## Team Roles

Assign one owner for each:

- ACP operator: creates ACP agents, agent wallets, and whitelisted dev wallets
- provider operator: runs the actual provider endpoints Boss Raid calls
- chain operator: deploys the settlement contracts and funds the demo wallets
- demo operator: runs the raid, captures the receipt, and opens the proof links

One person can hold multiple roles, but the responsibilities should stay explicit.

## Fixed Demo Mapping

Use the current provider ids already present in Boss Raid:

- `gamma` -> ACP display name `Gamma` -> game-development gameplay builder
- `riko` -> ACP display name `Riko` -> game-marketing video specialist
- `dottie` -> ACP display name `Dottie` -> pixel-art asset pack provider
- Mercenary = orchestrator, not a provider

For the game-specific raid path, keep these exact Boss Raid specializations on the provider registrations:

- `Gamma`: `game-development`, `gameplay`, `gb-studio`
- `Dottie`: `pixel-art`
- `Riko`: `game-marketing`, `remotion`

The Boss Raid provider ids should now match the mercenary names across registration, address maps, and proof capture.

## Phase 1: Prepare Wallets

Create these dedicated wallets:

- deployer hot wallet
- settlement client hot wallet
- evaluator address
- x402 receive address
- one ACP whitelisted dev wallet per ACP agent, or one dedicated shared controller wallet if your ACP setup requires that

Expected outcome:

- you have all wallet addresses written into [examples/virtuals-acp-capture-sheet.md](/Users/area/Desktop/boss-raid/examples/virtuals-acp-capture-sheet.md)

## Phase 2: Register Agents In Virtuals ACP

In ACP:

1. connect your wallet
2. join from the Build tab
3. register `Mercenary` as `Hybrid`
4. register `Gamma` as `Provider`
5. register `Riko` as `Provider`
6. register `Dottie` as `Provider`
7. create the smart wallet for each ACP agent
8. whitelist the dev wallet for each ACP agent
9. create at least one job offering per provider
10. save every profile

Important observed constraint:

- the OpenClaw ACP CLI can create the agents and wallets, but the created profiles still report `HYBRID` in CLI profile output
- if you need explicit `Provider` or `Evaluator` role presentation for the demo, finalize that in the ACP UI
- the CLI profile output also does not surface ERC-8004 refs, so capture those from the ACP UI or another official Virtuals surface

For each ACP agent, capture:

- entity id
- agent wallet
- whitelisted dev wallet
- ERC-8004 agent id
- ERC-8004 registration tx
- ERC-8004 identity registry
- optional reputation and validation registry refs

Write all of that into [examples/virtuals-acp-capture-sheet.md](/Users/area/Desktop/boss-raid/examples/virtuals-acp-capture-sheet.md).

Important:

- use the ACP agent wallet as the Boss Raid provider address
- do not use the ACP whitelisted dev wallet as the Boss Raid provider address
- do not wait until demo day to discover whether ERC-8004 sync is delayed

## Phase 3: Fill The Boss Raid Templates

Fill:

- [examples/base-mainnet-proof.env.example](/Users/area/Desktop/boss-raid/examples/base-mainnet-proof.env.example)
- [examples/provider-addresses.base-mainnet.json](/Users/area/Desktop/boss-raid/examples/provider-addresses.base-mainnet.json)
- [examples/provider-registration.base-mainnet.example.json](/Users/area/Desktop/boss-raid/examples/provider-registration.base-mainnet.example.json)

Rules:

- `BOSSRAID_X402_NETWORK=eip155:8453`
- `BOSSRAID_CHAIN_ID=8453`
- `BOSSRAID_RPC_URL` is your Base mainnet RPC
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON` should use ACP agent wallets for providers
- Mercenary ERC-8004 env should come from the Mercenary ACP registration output

## Phase 4: Run Boss Raid Locally Or In Your Deploy

At minimum, the API needs:

- `BOSSRAID_REGISTRY_TOKEN`
- the Base mainnet env values
- the Mercenary ERC-8004 env values

Start the app stack with your preferred path:

```bash
pnpm dev
```

Or run the pieces manually:

```bash
pnpm dev:providers
pnpm dev:api
pnpm dev:web
```

If you run the API separately, make sure `BOSSRAID_REGISTRY_TOKEN` is present before startup.

Before you touch Base mainnet, run the local no-payment rehearsal:

```bash
VENICE_API_KEY_GAMMA=... \
VENICE_API_KEY_RIKO=... \
VENICE_API_KEY_DOTTIE=... \
BOSSRAID_PROVIDERS_FILE=./examples/game-raid/providers.http.json \
pnpm test:game-raid:e2e
```

Expected result:

- one final raid result on `POST /v1/raid`
- three routed workstreams
- one synthesized Mercenary result with patch, image, video, bundle, and routing proof

## Phase 5: Register Boss Raid Providers

ACP registration is not enough. Boss Raid still needs the actual provider endpoint and auth config.

Each provider you want Mercenary to call must be registered through:

- `POST /agents/register`

Required request headers:

- `Authorization: Bearer $BOSSRAID_REGISTRY_TOKEN`
- `content-type: application/json`

Example:

```bash
curl -sS \
  -X POST http://127.0.0.1:8787/agents/register \
  -H "Authorization: Bearer $BOSSRAID_REGISTRY_TOKEN" \
  -H "content-type: application/json" \
  --data @examples/provider-registration.base-mainnet.example.json
```

For the Venice provider:

- set `agentId` to `gamma`
- set `modelFamily` to `venice`
- include the real ACP-backed ERC-8004 refs
- include privacy flags for `teeAttested`, `e2ee`, `noDataRetention`, and `signedOutputs`
- include the actual provider endpoint Boss Raid should call
- include the matching provider auth token or secret

For the other game-demo providers:

- clone the same shape
- set `agentId` to `riko` and `dottie`
- keep the provider specialization aligned to `game-marketing` plus `remotion`, and `pixel-art`
- Venice-backed providers are valid here too if the strict-private lane should keep the entire raid on Venice
- include the real ACP-backed ERC-8004 refs

## Phase 6: Deploy ERC-8183-Aligned Settlement

Run:

```bash
pnpm build

BOSSRAID_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<key> \
BOSSRAID_CHAIN_ID=8453 \
BOSSRAID_DEPLOYER_PRIVATE_KEY=0x... \
BOSSRAID_TOKEN_ADDRESS=0x... \
pnpm deploy:contracts
```

Then bootstrap the env:

```bash
pnpm bootstrap:settlement-env -- \
  --manifest temp/contracts/deployment.json \
  --provider-addresses examples/provider-addresses.base-mainnet.json \
  --evaluator-address 0x...
```

Then set:

```bash
BOSSRAID_CLIENT_PRIVATE_KEY=0x...
```

## Phase 7: Run The Strict-Private Demo Raid

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

The selected provider set should include the Venice provider when the lane is strict-private and eligible.

For the full game-demo raid, the selected provider set should include `Gamma`, `Riko`, and `Dottie` when all three are healthy and eligible.

## Phase 8: Settle And Capture Proof

Settle:

```bash
pnpm settle:raid -- --raid-id <raidId>
```

Open:

- `/receipt?raidId=<raidId>&token=<raidAccessToken>`
- `GET /v1/raids/<raidId>/agent_log.json?token=<raidAccessToken>`
- `GET /v1/raid/<raidId>/attested-result`

## Demo-Day Checks

Before the actual demo:

- confirm the Venice provider is still registered and reachable
- confirm Mercenary manifest shows ERC-8004 identity
- confirm the provider list shows ERC-8004 plus trust data
- confirm the strict-private raid selects the Venice provider lane
- confirm settlement tx hashes are explorer-visible on Base mainnet
- confirm the receipt shows routing proof, settlement proof, and attestation proof

## Failure Modes To Avoid

- ACP wallet copied into the wrong field
- whitelisted dev wallet used as provider address
- placeholder ERC-8004 tx hashes still in provider metadata
- provider endpoint registered in ACP but not registered in Boss Raid
- provider auth token in Boss Raid not matching the actual provider endpoint
- demo providers registered in different ERC-8004 flows with inconsistent registry references
- trying to rely on x402 alone without deploying the settlement contracts
