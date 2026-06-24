# Virtuals ACP Capture Sheet

Fill this out during ACP registration. Then copy the resulting values into the Boss Raid env and provider files.

## Mercenary

- ACP role:
- ACP entity ID:
- ACP agent wallet:
- ACP whitelisted dev wallet:
- ACP API key location:
- ERC-8004 agent id:
- ERC-8004 registration tx:
- ERC-8004 identity registry:
- ERC-8004 reputation registry:
- ERC-8004 validation registry:
- ERC-8004 validation txs:

Boss Raid destinations:

- `BOSSRAID_ERC8004_AGENT_ID`
- `BOSSRAID_ERC8004_OPERATOR_WALLET`
- `BOSSRAID_ERC8004_REGISTRATION_TX`
- `BOSSRAID_ERC8004_IDENTITY_REGISTRY`
- optional `BOSSRAID_ERC8004_REPUTATION_REGISTRY`
- optional `BOSSRAID_ERC8004_VALIDATION_REGISTRY`
- optional `BOSSRAID_ERC8004_VALIDATION_TXS`

## Venice Provider

- provider id:
- ACP role:
- ACP entity ID:
- ACP agent wallet:
- ACP whitelisted dev wallet:
- ERC-8004 agent id:
- ERC-8004 registration tx:
- ERC-8004 identity registry:
- ERC-8004 reputation registry:
- ERC-8004 validation registry:
- ERC-8004 validation txs:

Boss Raid destinations:

- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON[providerId]`
- provider `erc8004.agentId`
- provider `erc8004.operatorWallet`
- provider `erc8004.registrationTx`
- provider `erc8004.identityRegistry`
- optional provider `erc8004.reputationRegistry`
- optional provider `erc8004.validationRegistry`
- optional provider `erc8004.validationTxs`

## Comparison Provider

- provider id:
- ACP role:
- ACP entity ID:
- ACP agent wallet:
- ACP whitelisted dev wallet:
- ERC-8004 agent id:
- ERC-8004 registration tx:
- ERC-8004 identity registry:
- ERC-8004 reputation registry:
- ERC-8004 validation registry:
- ERC-8004 validation txs:

Boss Raid destinations:

- `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON[providerId]`
- provider `erc8004.agentId`
- provider `erc8004.operatorWallet`
- provider `erc8004.registrationTx`
- provider `erc8004.identityRegistry`
- optional provider `erc8004.reputationRegistry`
- optional provider `erc8004.validationRegistry`
- optional provider `erc8004.validationTxs`

## Boss Raid Settlement

- `BOSSRAID_RPC_URL`:
- `BOSSRAID_CHAIN_ID=8453`
- `BOSSRAID_X402_NETWORK=eip155:8453`
- `BOSSRAID_X402_PAY_TO`:
- `BOSSRAID_DEPLOYER_PRIVATE_KEY`:
- `BOSSRAID_CLIENT_PRIVATE_KEY`:
- `BOSSRAID_EVALUATOR_ADDRESS`:
- `BOSSRAID_REGISTRY_ADDRESS`:
- `BOSSRAID_ESCROW_ADDRESS`:
- `BOSSRAID_TOKEN_ADDRESS`:

Notes:

- use the ACP agent wallet as the Boss Raid provider address
- do not use the ACP whitelisted dev wallet as the Boss Raid provider address
- keep the Boss Raid evaluator address separate unless you intentionally want the same actor in both roles
