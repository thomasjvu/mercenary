# Virtuals ACP To Boss Raid Mapping

Use this when Virtuals ACP is your operational registration path and Boss Raid is your orchestration and proof surface.

## Recommended Agent Set

For the final demo:

- Mercenary: `Hybrid`
- Gamma: `Provider`
- Riko: `Provider`
- Dottie: `Provider`
- optional ACP-only evaluator agent: `Evaluator`

Why:

- Mercenary receives one task and can also hire other agents
- the provider identities should read like real ACP agents, not internal ids
- distinct provider specialties make the routing story legible

## Important Separation

Do not mix these concepts:

- ACP `entity ID`: Virtuals ACP identifier for one registered agent
- ACP `agent wallet`: the smart wallet address issued by ACP for that agent
- ACP `whitelisted dev wallet`: the EOA you control that is allowed to act for the ACP agent
- Boss Raid `provider address`: the onchain address used in `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`
- Boss Raid `evaluator address`: the onchain address recorded in ERC-8183-aligned child jobs as the evaluator

Recommended rule:

- use the ACP agent wallet as the Boss Raid provider address
- do not use the whitelisted dev wallet as the Boss Raid provider address
- keep the Boss Raid evaluator address separate unless you intentionally want the same actor to own both roles

## Execution Lane

ACP registration and ACP offerings do not make Mercenary call ACP directly.

Current live execution path:

- Virtuals ACP handles agent registration, walleting, marketplace presence, and ERC-8004-linked identity capture
- Boss Raid provider registration exposes the real HTTP endpoint Mercenary calls
- Mercenary discovers eligible providers from the Boss Raid registry and dispatches work to those HTTP providers through the native raid engine

Practical consequence:

- if you want `Gamma`, `Riko`, and `Dottie` to appear in ACP and also work inside one Mercenary raid, keep the ACP identity and the Boss Raid provider registration aligned, but still register the HTTP endpoints in Boss Raid

## Field Mapping

| Virtuals ACP surface | What it means | Boss Raid destination | Notes |
| --- | --- | --- | --- |
| Connected wallet | your login wallet in the ACP UI | none | do not use this as provider identity unless ACP explicitly makes it the operator wallet |
| Agent Name | registered ACP agent name | `name` / `displayName` | keep naming consistent across ACP and Boss Raid |
| Agent Role | requestor, provider, hybrid, evaluator | none directly | for Boss Raid, this is architecture intent, not a stored field |
| Business Description | provider description shown in ACP | `description` | keep the wording aligned with your public story |
| Job Name | ACP service offering title | `capabilities` and narrative docs | Boss Raid does not store ACP job names directly |
| Job Description | ACP service description | `description` / `specializations` | keep these aligned so judges see the same role everywhere |
| Price (USD) | ACP service price | `pricing.pricePerTaskUsd` or `pricePerTaskUsd` | keep ACP and Boss Raid pricing consistent for the demo |
| SLA | ACP delivery target | none directly | mention it in submission/demo notes if useful |
| Entity ID | ACP id for that agent | capture sheet only | keep it for ACP SDK/runtime and audit notes |
| Agent Wallet | ACP smart wallet | `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON` or `erc8004.operatorWallet` if that is what the synced record resolves to | this is the most important field to copy correctly |
| Whitelisted Dev Wallet | your controller EOA | ACP SDK env only | this is not the provider address |
| ERC-8004 agent id synced by ACP | trust identity | `BOSSRAID_ERC8004_AGENT_ID` or provider `erc8004.agentId` | use the real value from ACP-backed registration |
| ERC-8004 registration tx | onchain registration proof | `BOSSRAID_ERC8004_REGISTRATION_TX` or provider `erc8004.registrationTx` | required for final proof |
| ERC-8004 identity registry | onchain registry contract | `BOSSRAID_ERC8004_IDENTITY_REGISTRY` or provider `erc8004.identityRegistry` | required for final proof |
| ERC-8004 reputation registry | optional trust source | `BOSSRAID_ERC8004_REPUTATION_REGISTRY` or provider `erc8004.reputationRegistry` | use when ACP exposes it |
| ERC-8004 validation registry | optional validation source | `BOSSRAID_ERC8004_VALIDATION_REGISTRY` or provider `erc8004.validationRegistry` | use when ACP exposes it |

## Registration Checklist

1. Connect your wallet in ACP.
2. Join ACP from the Build tab.
3. Register `Mercenary` as a `Hybrid` agent.
4. Register `Gamma` as a `Provider` agent.
5. Register `Riko` as a `Provider` agent.
6. Register `Dottie` as a `Provider` agent.
7. Create a smart wallet for each ACP agent.
8. Whitelist one dedicated dev wallet for each ACP agent, or one shared dedicated dev wallet if your operational model requires it.
9. Save each profile and confirm the agent is listed in ACP.
10. Capture each agent's `entity ID`.
11. Capture each agent's `agent wallet`.
12. Capture each whitelisted dev wallet address.
13. Capture the ERC-8004 sync outputs for each registered agent.
14. Fill [examples/virtuals-acp-capture-sheet.md](/Users/area/Desktop/boss-raid/examples/virtuals-acp-capture-sheet.md).
15. Copy the final values into [examples/base-mainnet-proof.env.example](/Users/area/Desktop/boss-raid/examples/base-mainnet-proof.env.example), [examples/provider-addresses.base-mainnet.json](/Users/area/Desktop/boss-raid/examples/provider-addresses.base-mainnet.json), and [examples/provider-registration.base-mainnet.example.json](/Users/area/Desktop/boss-raid/examples/provider-registration.base-mainnet.example.json).

## Observed CLI Constraints

Observed from the OpenClaw ACP CLI on March 22, 2026:

- `acp agent create` successfully creates and saves the ACP agent wallet locally
- the created agent profile returned by the CLI still shows `role: "HYBRID"`
- `acp profile show` and `acp whoami` do not expose ERC-8004 agent id, registration tx, or registry addresses

Practical consequence:

- use the CLI to create agents and persist wallets locally
- use the ACP UI to finalize the intended role when the lane must be explicitly `Provider` or `Evaluator`
- use the ACP UI or another official Virtuals surface to capture ERC-8004 references for the final Boss Raid proof

## Mercenary Mapping

Recommended ACP role: `Hybrid`

Copy these fields:

- ACP agent wallet -> `BOSSRAID_ERC8004_OPERATOR_WALLET` only if the final ERC-8004 record resolves to that same wallet
- ERC-8004 agent id -> `BOSSRAID_ERC8004_AGENT_ID`
- ERC-8004 registration tx -> `BOSSRAID_ERC8004_REGISTRATION_TX`
- ERC-8004 identity registry -> `BOSSRAID_ERC8004_IDENTITY_REGISTRY`
- optional reputation and validation refs -> matching `BOSSRAID_ERC8004_*`

Mercenary is not a provider in `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON` unless you deliberately make it a provider in your own settlement graph.

## Provider Mapping

Recommended ACP role: `Provider`

Copy these fields:

- ACP agent wallet -> `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON[providerId]`
- ERC-8004 agent id -> provider `erc8004.agentId`
- ERC-8004 registration tx -> provider `erc8004.registrationTx`
- ERC-8004 identity registry -> provider `erc8004.identityRegistry`
- optional reputation and validation refs -> provider `erc8004.*`

Current Boss Raid provider-id to ACP display-name mapping:

- `gamma` -> `Gamma`
- `riko` -> `Riko`
- `dottie` -> `Dottie`

Keep the same ids in ACP notes, Boss Raid provider registration, and the provider-address map.

For the current game-demo runtime:

- `Gamma` maps to the Boss Raid `gbstudio` HTTP provider mode
- `Riko` maps to the Boss Raid `remotion` HTTP provider mode
- `Dottie` maps to the Boss Raid `pixel_art` HTTP provider mode

## ACP Runtime Values You Still Need Outside Boss Raid

Boss Raid does not currently store ACP runtime fields like:

- `entity ID`
- `WHITELISTED_WALLET_PRIVATE_KEY`
- ACP API key

Keep those in your ACP runtime secrets and operator notes.

## Sources

- [Virtuals ACP Tech Playbook](https://whitepaper.virtuals.io/builders-hub/acp-tech-playbook)
- [Virtuals Set Up Agent Profile](https://whitepaper.virtuals.io/acp-product-resources/acp-onboarding-guide/set-up-agent-profile)
- [Virtuals Initialize and Whitelist Wallet](https://whitepaper.virtuals.io/acp-product-resources/acp-dev-onboarding-guide/set-up-agent-profile/initialize-and-whitelist-wallet)
- [Virtuals Create Job Offering](https://whitepaper.virtuals.io/acp-product-resources/acp-onboarding-guide/set-up-agent-profile/create-job-offering)
- [Virtuals ACP FAQ](https://whitepaper.virtuals.io/acp-product-resources/acp-faq)
- [Virtuals ACP Changelogs](https://whitepaper.virtuals.io/acp-product-resources/acp-changelogs)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
