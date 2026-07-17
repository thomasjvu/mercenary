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
pnpm bossraid deploy:contracts
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

pnpm bossraid bootstrap:settlement-env -- \
  --manifest temp/contracts/deployment.json \
  --provider-addresses examples/settlement/provider-addresses.json \
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
BOSSRAID_PROVIDER_ADDRESSES_FILE=examples/settlement/provider-addresses.json \
BOSSRAID_EVALUATOR_ADDRESS=0x... \
pnpm bossraid bootstrap:onchain
```

This deploys both contracts, writes the deployment manifest, writes the settlement env file, and prints the next manual step.

## Security notes (audit 2026-07 + QuillShield)

Hardened in-repo contracts:

- **BossJobEscrow**: `submit` / `complete` require `block.timestamp < expiresAt` (expiry is a hard stop; `claimRefund` after expiry).
- **Fund CEI**: status / remaining budget updated **before** token pull (blocks callback double-fund).
- **TokenTransfer**: SafeERC20-style optional return + `pullExact` (rejects fee-on-transfer / amount mismatch).
- **BossBountyEscrow**: `acceptAward` is **poster-only** (operator has `acceptAwardOnBehalf`); after `acceptDeadline`, `claimPayout` is permissionless to the provider. Awards store `bountyId`; delivery by `deliveryDeadline`; `forfeitAward` after delivery window for undelivered Pending awards. **Operator is rotatable** via `transferOperator` + `acceptOperator` (two-step; not immutable).
- **BossJobEscrow roles**: evaluator must differ from client and provider (blocks trivial self-deal evaluator). Evaluator remains a trusted settlement role by product design — custody high-assurance keys.
- **RaidRegistry**: constructed with `jobEscrow`; `linkChildJob` requires the job to exist on that escrow and `job.client == msg.sender`. `linkChildJob` reverts after finalize.
- Constructors reject zero token / operator / escrow addresses.

Designed for standard 1:1 ERC20 (USDG/USDC-class). Redeploy after bytecode changes. Deploy order: job escrow → registry(escrow) → bounty escrow.

## Tests

```bash
cd packages/contracts
forge test -vv          # or: pnpm test:forge
pnpm test               # TypeScript deploy tests
```

Foundry suite covers expiry races, poster-only accept, delivery deadline, registry finalize immutability.

## Still Missing

- token allowance/bootstrap flow for funded jobs
- deployment verification / address book
- resume tooling for partially settled child-job batches
- chain-specific config presets
- SafeERC20 / fee-on-transfer token allowlist (document USDC/USDG-only for now)
- operator key rotation (immutable operator is trust-rooted)
