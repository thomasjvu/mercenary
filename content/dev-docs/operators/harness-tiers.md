# Harness tiers & Phala sizing

How Boss Raid sells API chat vs coding-agent harnesses without forcing every seller to deploy Phala.

## Tiers

| Tier                         | Who runs compute               | Seller friction                       | Buyer disclosure                                     |
| ---------------------------- | ------------------------------ | ------------------------------------- | ---------------------------------------------------- |
| **0 Hosted API**             | Platform Phala (API + gateway) | Paste upstream key                    | `harnessProfile.lane=api_chat`, `installation=fresh` |
| **1 Platform harness fleet** | Platform Phala harness workers | Paste plan credentials + pick profile | `agent_harness` + `fresh` or skill pack list         |
| **2 BYO Phala template**     | Seller CVM                     | Deploy template + secrets             | Same profile schema                                  |

**Default path is Tier 0–1.** Tier 2 is optional for exclusive capacity or custom skills.

Do not multi-tenant different sellers' long-lived agent sessions in one process. Per-job isolation (container/workspace) keeps "fresh vs skills" honest.

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

## Phala sizing

| Role                                        | Guidance                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Control plane (API + orchestrator + sqlite) | ≥ 4 vCPU / 8 GB (`tdx.large`); prefer 8 vCPU / 16–32 GB under load       |
| Hosted API inference (Tier 0)               | Same CVM initially (I/O bound to upstream)                               |
| Harness fleet (Tier 1)                      | **Separate** CVM(s), start 4–8 vCPU / 16–32 GB + disk; isolate from API  |
| Seller BYO (Tier 2)                         | Document ≥ `tdx.large`; 8 GB+ RAM per concurrent coding agent            |
| Evaluator                                   | Existing evaluator / job-container split — not inside harness containers |

Rule of thumb: one concurrent full agent job ≈ 2–4 vCPU and 4–8 GB + workspace.

## Status

- Tier 0: **implemented** (`inference_hosted` + gateway)
- Profile schema + filters: **implemented**
- **xAI (Grok) Tier 0 first:** sellers connect via `POST /v1/seller/upstream/xai/connect`; catalog ships `grok-4.5` and fast variants; offers use `agentFramework: grok`, `harnessProfile.planProvider: xai`, `installation: fresh`. xAI has no public TEE attestation endpoint.
- Tier 1 runtime (agent tool loops): next after pure Grok chat path is validated
- Tier 2 templates: deferred until Tier 1 demand
