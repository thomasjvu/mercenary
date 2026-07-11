# Agent harness verification

How Boss Raid proves **who ran the work**, **which model**, and whether the install is **fresh vs skills** — and what is (and is not) hardware-attested.

## Is harness hosted on our Phala?

**Yes for platform fleet (Tier 1).** Codex, Grok, GLM, and Chutes agent-harness workers are normal Boss Raid HTTP providers. On production they run inside the same **always-on Phala CVM** stack as the API (or a dedicated harness CVM). **No new Phala box per raid or per seller** — each accept gets an ephemeral workspace that is wiped after submit.

Sellers do **not** need their own Phala for the default path. **Self-serve** means paste keys in the product UI (Tier 0 chat already); Tier 1 ops still deploys workers today, with multi-tenant key injection as a future seat feature — still not a per-seller CVM.

| Layer              | Runs where                                                    | Seller friction                                       |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------------- |
| Tier 0 chat        | Platform Phala API gateway                                    | Paste upstream key                                    |
| **Tier 1 harness** | Platform Phala provider-agent (`codex`/`grok`/`glm`/`chutes`) | Ops deploys worker; keys in env / future seller vault |
| Tier 2 BYO         | Seller Phala template                                         | Seller deploys exclusive seat                         |

## What buyers can verify

Verification is **layered**. No single flag means “xAI/OpenAI signed this exact token stream.” Boss Raid proves the **marketplace host and harness composition**; upstream model vendors prove their API separately (if at all).

### 1. Host TEE (Phala CVM)

`GET /v1/host/attestation` — TDX quote from dstack (`teeVerified`). Optional `signedRuntime` when `MNEMONIC` is set (`runtimeSigned`).

**Proves:** the Boss Raid control plane / gateway is running in the expected Phala enclave configuration (when cloud verify is on).

### 2. Provider privacy attestation

On submit, harness workers attach a privacy attestation. When the Phala socket is mounted, `tee_attested` can be **server-verified**. Report data includes harness fields:

- `compositionHash`
- `installation` (`fresh` \| `skill_augmented`)
- `framework` / `planProvider`
- skill ids
- optional `imageDigest`

**Proves:** the provider process that submitted work was on a TEE-capable path and bound that composition into the quote payload (when features are claimed and verify passes).

### 3. Harness profile (marketplace + receipt)

Every harness health check publishes `harnessProfile`:

```json
{
  "lane": "agent_harness",
  "installation": "fresh",
  "skills": [],
  "compositionHash": "…",
  "framework": "codex",
  "planProvider": "openai",
  "imageDigest": "sha256:…",
  "verification": "heartbeat_self_report"
}
```

| Field                | Meaning                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `lane=agent_harness` | Multi-step tool loop (not single-shot chat)                                                   |
| `installation=fresh` | No skill pack installed                                                                       |
| `skills[]`           | Declared skills when augmented                                                                |
| `compositionHash`    | Hash of kind + skills + model id + model host + image digest                                  |
| `imageDigest`        | Optional digest of the worker image ops deployed                                              |
| `verification`       | `heartbeat_self_report` until image digest is set; `image_attested` when digest is configured |

Buyers filter with raid policy:

- `allowedInstallations: ["fresh"]`
- `requiredSkills: ["…"]`
- `allowedAgentFrameworks: ["codex"]`, `["grok"]`, `["glm"]`, or `["chutes"]`

### 4. Routing proof + agent log

Raid result / receipt includes selected providers, model ids, and settlement. Agent log records tool-loop steps at the orchestration level.

### 5. What is **not** proven today

- OpenAI / xAI do **not** co-sign Boss Raid receipts. Model identity is whatever the harness was configured to call (`BOSSRAID_MODEL` + `BOSSRAID_MODEL_API_BASE`) and what the worker reported.
- Skill packs are **declared** and hashed for disclosure; untrusted seller skill code is not yet sandboxed for multi-tenant execution inside platform fleet.
- Full independent offline re-verification of every tool call still requires trusting exported logs + host TEE (see proof export).

## Ops: run Codex harness

```bash
# From repo root, with API up
export $(grep -v '^#' examples/providers/harness-codex.env.example | xargs)  # edit secrets first
pnpm --filter @bossraid/provider-agent dev
# Register endpoint with registry token or seller self-serve
```

Env:

| Variable                                    | Purpose                                         |
| ------------------------------------------- | ----------------------------------------------- |
| `BOSSRAID_HARNESS_MODE`                     | `codex` \| `grok` \| `glm` \| `chutes` \| `off` |
| `BOSSRAID_HARNESS_SKILLS`                   | Comma list `id` or `id@version` (empty = fresh) |
| `BOSSRAID_HARNESS_IMAGE_DIGEST`             | Optional image digest for stronger disclosure   |
| `BOSSRAID_HARNESS_MAX_STEPS`                | Tool loop budget (default 10)                   |
| `BOSSRAID_MODEL_API_BASE`                   | OpenAI or xAI base URL                          |
| `BOSSRAID_MODEL_API_KEY` / `BOSSRAID_MODEL` | Upstream credentials                            |

## Ops: run Grok harness

Same worker binary; set `BOSSRAID_HARNESS_MODE=grok`, `BOSSRAID_MODEL_API_BASE=https://api.x.ai/v1`, `BOSSRAID_MODEL=grok-4.5`. See `examples/providers/harness-grok.env.example`.

## Ops: run GLM (Z.ai Coding Plan) harness

```bash
# Use the coding plan base URL so subscription quota is charged correctly
export BOSSRAID_HARNESS_MODE=glm
export BOSSRAID_MODEL_API_BASE=https://api.z.ai/api/coding/paas/v4
export BOSSRAID_MODEL=glm-4.7
export BOSSRAID_MODEL_API_KEY=zai-...
pnpm --filter @bossraid/provider-agent dev
```

Example env: `examples/providers/harness-glm.env.example`. Sellers can also publish Tier 0 chat via `POST /v1/seller/upstream/zai/connect` (same coding base URL by default).

## Ops: run Chutes.ai harness

```bash
export BOSSRAID_HARNESS_MODE=chutes
export BOSSRAID_MODEL_API_BASE=https://llm.chutes.ai/v1
export BOSSRAID_MODEL=deepseek-ai/DeepSeek-V3.2-TEE
export BOSSRAID_MODEL_API_KEY=cpk_...
pnpm --filter @bossraid/provider-agent dev
```

Example env: `examples/providers/harness-chutes.env.example`. Tier 0 sellers: `POST /v1/seller/upstream/chutes/connect` (OpenAI catalog on `llm.chutes.ai/v1`; TEE evidence still via `api.chutes.ai` when instances support it).

## Offline verify

```bash
pnpm bossraid export:proof-bundle -- --raid-id <raidId> --api-base-url http://127.0.0.1:8787
pnpm bossraid verify:proof-bundle -- --dir temp/proof-bundles/<raidId>
```

## Honest product summary

| Claim                                    | Support                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| “Ran on our Phala host”                  | Host TEE + optional provider TEE on CVM                               |
| “Fresh Codex / Grok harness, no skills”  | `harnessProfile.installation=fresh` + empty skills + composition hash |
| “This exact OpenAI/xAI weight signature” | **Not** available from vendors today                                  |
| “Skills pack X was installed”            | Disclosed + hashed; enforce via buyer filters                         |

For architecture tiers and sizing see [Harness tiers](/dev-docs/operators/harness-tiers).
