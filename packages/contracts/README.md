# Contracts

These contracts are the Solidity base for Mercenary's ERC-8183-aligned settlement layer.

- `BossJobEscrow.sol` models per-provider child jobs with client-side open rejection, provider submit, evaluator completion or rejection, and expiry refunds.
- `RaidRegistry.sol` tracks parent raid metadata, linked child jobs, and final evaluation commitments.

Boss Raid surfaces that settlement proof directly on the live result and receipt paths. When a parent raid settles, the runtime exposes:

- `proofStandard: "erc8183_aligned"`
- `contracts.registryAddress` and `contracts.escrowAddress`
- `registryCall` proof for the parent raid finalize path
- `childJobs[]` proof for each provider-scoped job linked back to the parent raid

That is the public proof layer used by `/receipt`, result payloads, ops receipts, and per-raid `agent_log.json`.

## Deploy

Required env:

- `BOSSRAID_RPC_URL`
- `BOSSRAID_DEPLOYER_PRIVATE_KEY`
- `BOSSRAID_TOKEN_ADDRESS`

Optional:

- `BOSSRAID_CHAIN_ID`
- `BOSSRAID_CONTRACTS_OUT`

Run:

```bash
pnpm build

BOSSRAID_RPC_URL=https://rpc.example \
BOSSRAID_DEPLOYER_PRIVATE_KEY=0x... \
BOSSRAID_TOKEN_ADDRESS=0x... \
pnpm deploy:contracts
```

The deploy script compiles the Solidity with `solc-js`, deploys both contracts, writes a manifest, and prints env lines for the orchestrator settlement path.

Role definitions:

- `BOSSRAID_DEPLOYER_PRIVATE_KEY`: hot wallet used only for contract deployment txs
- `BOSSRAID_CLIENT_PRIVATE_KEY`: hot wallet used later for onchain raid settlement txs
- `BOSSRAID_EVALUATOR_ADDRESS`: address recorded on each child job as the evaluator
- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`: provider-id to provider-address map used when child jobs are created
- `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY`: optional evaluator signer for auto-complete and funded-job reject flows
- `BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON`: optional provider-id to private-key map for auto-submit flows
- `BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS`: block parent finalize until every child job is terminal

`BOSSRAID_RPC_URL` is required for deployment and onchain settlement. It is not required for x402 by itself.

## Settlement Env Bootstrap

Run:

```bash
pnpm build

pnpm bootstrap:settlement-env -- \
  --manifest temp/contracts/deployment.json \
  --provider-addresses examples/provider-addresses.json \
  --evaluator-address 0x...
```

This writes `temp/contracts/settlement.env` unless `--out` or `BOSSRAID_SETTLEMENT_ENV_OUT` is set.

Use `--evaluator-address` for the address that should appear onchain as the evaluator for every child job in the demo.
If you also set `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY` and `BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON`, the runtime can auto-advance child jobs through submit and complete or reject.

## Full Bootstrap

Run:

```bash
pnpm build

BOSSRAID_RPC_URL=https://rpc.example \
BOSSRAID_DEPLOYER_PRIVATE_KEY=0x... \
BOSSRAID_TOKEN_ADDRESS=0x... \
BOSSRAID_PROVIDER_ADDRESSES_FILE=examples/provider-addresses.json \
BOSSRAID_EVALUATOR_ADDRESS=0x... \
pnpm bootstrap:onchain
```

This deploys both contracts, writes the deployment manifest, writes the settlement env file, and prints the next manual step.

## Still Missing

- contract tests
- token allowance/bootstrap flow for funded jobs
- deployment verification
- resume tooling for partially settled child-job batches
- chain-specific config presets

Future tests should cover:

- client funding
- provider submission
- evaluator completion
- rejection and refund flows
- raid finalization and child-job linkage
