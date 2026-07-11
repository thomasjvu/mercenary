# Harness tiers & Phala sizing

How Boss Raid sells API chat vs coding-agent harnesses without forcing every seller to deploy Phala.

## Tiers

| Tier                         | Who runs compute               | Seller friction                  | Buyer disclosure                                     |
| ---------------------------- | ------------------------------ | -------------------------------- | ---------------------------------------------------- |
| **0 Hosted API**             | Platform Phala (API + gateway) | Paste upstream key               | `harnessProfile.lane=api_chat`, `installation=fresh` |
| **1 Platform harness fleet** | Platform Phala provider-agent  | Ops runs `BOSSRAID_HARNESS_MODE` | `agent_harness` + `fresh` or skill pack list         |
| **2 BYO Phala template**     | Seller CVM                     | Deploy template + secrets        | Same profile schema                                  |

**Default path is Tier 0–1.** Tier 2 is optional for exclusive capacity or custom skills.

Do not multi-tenant different sellers' long-lived agent sessions in one process. Per-job isolation (ephemeral workspace per accept) keeps "fresh vs skills" honest.

## Harness profile

```ts
{
  lane: 'api_chat' | 'agent_harness',
  installation: 'fresh' | 'skill_augmented' | 'unknown',
  skills: [{ id, name?, version?, contentHash? }],
  imageDigest?, compositionHash?, framework?, planProvider?,
  verification?: 'unverified' | 'heartbeat_self_report' | 'image_attested'
}
```

Raid constraints: `allowedInstallations`, `requiredSkills` (see `RaidConstraints` in shared-types).

## Agent tool loop (Tier 1)

`apps/provider-agent` with:

- `BOSSRAID_HARNESS_MODE=codex` — OpenAI-compatible chat tools (Codex-class models)
- `BOSSRAID_HARNESS_MODE=grok` — xAI chat tools (`api.x.ai`)

Each accept:

1. Seeds an ephemeral workspace from raid task files
2. Runs a multi-step tool loop: `list_files`, `read_file`, `write_file`, `submit_result`
3. Builds unified diff from workspace edits when the task wants a patch
4. Wipes the workspace
5. Attaches privacy attestation (Phala TEE when socket mounted) with composition hash in report data

Examples: `examples/providers/harness-codex.env.example`, `examples/providers/harness-grok.env.example`.

Verification detail: [Harness verification](/docs/operators/harness-verification).

## Phala sizing

| Role                                        | Guidance                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Control plane (API + orchestrator + sqlite) | ≥ 4 vCPU / 8 GB (`tdx.large`); prefer 8 vCPU / 16–32 GB under load       |
| Hosted API inference (Tier 0)               | Same CVM initially (I/O bound to upstream)                               |
| Harness fleet (Tier 1)                      | Prefer **separate** CVM(s), start 4–8 vCPU / 16–32 GB + disk             |
| Seller BYO (Tier 2)                         | Document ≥ `tdx.large`; 8 GB+ RAM per concurrent coding agent            |
| Evaluator                                   | Existing evaluator / job-container split — not inside harness containers |

Rule of thumb: one concurrent full agent job ≈ 2–4 vCPU and 4–8 GB + workspace.

## Status

- Tier 0: **implemented** (`inference_hosted` + gateway), including **xAI chat**
- Profile schema + filters: **implemented**
- **Tier 1 tool loops: implemented** for **Codex** and **Grok** via provider-agent harness mode
- Host TEE + composition-bound report data: **implemented** when Phala socket is present
- Tier 2 BYO templates: still optional / deferred
