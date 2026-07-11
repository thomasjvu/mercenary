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

| Tier                   | Who runs compute              | Seller friction                  | Buyer disclosure         |
| ---------------------- | ----------------------------- | -------------------------------- | ------------------------ |
| **0 Hosted API**       | Platform Phala gateway        | Paste upstream key               | `api_chat` + `fresh`     |
| **1 Platform harness** | Platform Phala provider-agent | Ops runs `BOSSRAID_HARNESS_MODE` | `agent_harness` + skills |
| **2 BYO Phala**        | Seller CVM                    | Deploy template                  | Same profile schema      |

## Harness modes

- `codex` — OpenAI tools
- `grok` — xAI tools (`api.x.ai`)
- `glm` — Z.ai Coding Plan (`api.z.ai/api/coding/paas/v4`)
- `chutes` — Chutes OpenAI gateway (`llm.chutes.ai/v1`, TEE models preferred)

Examples: `examples/providers/harness-*.env.example`.

Verification: [Harness verification](/docs/operators/harness-verification). Offline: `pnpm bossraid verify:proof-bundle`.

## Status

- Tier 0: Venice, xAI, Z.ai/GLM, **Chutes**, Redpill, NEAR, Phala
- Tier 1 tool loops: **codex**, **grok**, **glm**, **chutes**
- Offline verifier: export + verify proof-bundle
