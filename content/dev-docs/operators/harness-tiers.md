# Harness tiers & Phala sizing

How Boss Raid sells API chat vs coding-agent harnesses without forcing every seller to deploy Phala.

## Phala topology (important)

**We do not create a new Phala CVM per raid or per seller.**

| Unit           | Lifetime                                                                         |
| -------------- | -------------------------------------------------------------------------------- |
| Phala CVM      | Always-on (API + optional harness workers)                                       |
| Harness accept | Ephemeral workspace (temp dir → tools → wipe)                                    |
| Extra CVM      | Only when ops scales fleet capacity or a Tier-2 BYO seller deploys their own box |

**Self-serve** = seller pastes credentials / publishes offers in the web UI (no SSH). It is **not** “Boss Raid spins a private Phala for every signup.”

## Tiers

| Tier                         | Who runs compute               | Seller friction                  | Buyer disclosure                                     |
| ---------------------------- | ------------------------------ | -------------------------------- | ---------------------------------------------------- |
| **0 Hosted API**             | Platform Phala (API + gateway) | Paste upstream key               | `harnessProfile.lane=api_chat`, `installation=fresh` |
| **1 Platform harness fleet** | Platform Phala provider-agent  | Ops runs `BOSSRAID_HARNESS_MODE` | `agent_harness` + `fresh` or skill pack list         |
| **2 BYO Phala template**     | Seller CVM                     | Deploy template + secrets        | Same profile schema                                  |

## Harness modes

`apps/provider-agent` with:

- `BOSSRAID_HARNESS_MODE=codex` — OpenAI tools
- `BOSSRAID_HARNESS_MODE=grok` — xAI tools
- `BOSSRAID_HARNESS_MODE=glm` — Z.ai GLM Coding Plan tools (`https://api.z.ai/api/coding/paas/v4`)

Examples: `examples/providers/harness-codex.env.example`, `harness-grok.env.example`, `harness-glm.env.example`.

Verification: [Harness verification](/docs/operators/harness-verification). Offline: `pnpm bossraid verify:proof-bundle`.

## Phala sizing

| Role                   | Guidance                                                   |
| ---------------------- | ---------------------------------------------------------- |
| Control plane          | ≥ 4 vCPU / 8 GB (`tdx.large`); prefer 8 / 16–32 under load |
| Hosted API (Tier 0)    | Same CVM initially                                         |
| Harness fleet (Tier 1) | Prefer separate CVM(s), 4–8 vCPU / 16–32 GB + disk         |
| Seller BYO (Tier 2)    | ≥ `tdx.large`; 8 GB+ RAM per concurrent agent              |

## Status

- Tier 0: Venice, xAI, **Z.ai/GLM**, Redpill, NEAR, Chutes, Phala hosted keys
- Tier 1 tool loops: **codex**, **grok**, **glm**
- Offline proof verifier: `export:proof-bundle` + `verify:proof-bundle`
- Multi-tenant platform key injection into shared harness pool: future
