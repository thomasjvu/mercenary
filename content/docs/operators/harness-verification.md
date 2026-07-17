# Agent harness verification

How Boss Raid proves **who ran the work**, **which model**, and whether the install is **fresh vs skills** — and what is (and is not) hardware-attested.

## How Grok / Codex / Claude Code relate (important)

Boss Raid does **not** multi-tenant-sell consumer logins (ChatGPT Plus, Claude Pro, `grok login` OAuth for other people). Seller seats use **API keys** (or plan keys like Z.ai coding plan). Anthropic’s own Agent SDK docs forbid third parties offering claude.ai login rate limits.

| Brand in Boss Raid      | What runs today                                                              | Auth for multi-tenant sell                       | Vendor “bare agent” product                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Grok** harness        | Our OpenAI-compatible **tool loop** → `https://api.x.ai/v1/chat/completions` | `BOSSRAID_XAI_API_KEY` / seller xAI key          | Grok CLI headless (`grok -p`) uses **local** `XAI_API_KEY` or `grok login` on the operator’s machine — not a shared seller marketplace                                                                                                     |
| **Codex** harness       | Same tool loop → `https://api.openai.com/v1`                                 | OpenAI **platform API key** (seller or platform) | [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) (`@openai/codex-sdk`) is a richer local/app-server agent; can be a future runtime backend, still not ChatGPT account resale                                                          |
| **Claude Code** harness | Same tool loop → `https://api.anthropic.com/v1`                              | Anthropic **API key**                            | [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) (`@anthropic-ai/claude-agent-sdk`) is the real Claude Code agent-as-library; requires API key (or Bedrock/Vertex), **not** claude.ai OAuth for third-party products |

So: **yes, we can use Codex / Claude as agents** in the marketplace sense by selling **API-key-backed harness seats**. That is already how Grok works for sellers (encrypted key → gateway tool loop), not “Grok OAuth multi-tenant.”

**Buyer** side is different: you can point Grok CLI at Boss Raid as a custom model (`base_url` + `br_` / admin token) and use your own OAuth/API for other models — that does not mean Boss Raid resells your Grok login to others.

### Native SDK runtimes (Phase 3)

Harness execution backend is selected at runtime:

| Backend                  | When                            | What runs                                                          |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------ |
| `openai_tools` (default) | Always available                | Boss Raid tool loop → vendor `chat/completions`                    |
| `claude_agent_sdk`       | `claude_code` + native SDK mode | Claude Agent SDK if installed in image, else `claude` CLI headless |
| `codex_sdk`              | `codex` + native SDK mode       | Codex SDK if installed, else `codex` CLI                           |

Env:

| Variable                                             | Purpose                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `BOSSRAID_HARNESS_RUNTIME_BACKEND`                   | `auto` (default), `openai_tools`, `claude_agent_sdk`, `codex_sdk`                          |
| `BOSSRAID_HARNESS_NATIVE_SDK`                        | `0` / `1` / `require` — `auto` uses native backends for codex/claude when `1` or `require` |
| `BOSSRAID_HARNESS_IMAGE_DIGEST`                      | Platform default image digest for harness seats                                            |
| `BOSSRAID_HARNESS_IMAGE_ALLOWLIST`                   | Comma-separated digests allowed for specialized (and optional vanilla) seats               |
| `BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST`           | `1` = fail specialized without allowlisted digest (also enforced in production)            |
| `BOSSRAID_CLAUDE_CLI_BIN` / `BOSSRAID_CODEX_CLI_BIN` | Override CLI binary paths in SDK images                                                    |

Specialized seats (`skill_augmented` or non-empty skills) **must** pin `imageDigest`. Runtime (`assertHarnessImageAllowed`) and registry integrity (`evaluateHarnessProfileIntegrity`) share the same rules: production or `BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST=1` requires a non-empty allowlist that includes that digest; when an allowlist is set in any env, unlisted digests fail both paths.

Grok remains `openai_tools` against `api.x.ai` (no separate Grok “agent SDK” package in-tree).

## Is harness hosted on our Phala?

**Yes for platform fleet (Tier 1).** On production, harness work runs inside the same **always-on Phala CVM** stack as the API (or a dedicated harness CVM). **No new Phala box per raid or per seller** — each accept gets an ephemeral workspace that is wiped after submit.

### Should we auto-provision a Phala CVM per seller?

**No (default).** Auto-provision is slow, expensive, and unnecessary for marketplace volume.

| Option                          | When                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| **HTTP agent worker (primary)** | Seller runs Claude Code / Grok Build / Codex / custom; registers HTTP endpoint + `harnessProfile` |
| **Hosted chat**                 | Seller pastes API key for single-shot completions (not agent hire)                                |
| **Ops-run / platform harness**  | Ops-only shared tool loop; not the primary third-party seller product path                        |
| **BYO Phala CVM**               | Power seller needs exclusive capacity / custom skills image — manual                              |

### Seller self-serve (product path)

1. **Hosted chat:** `POST /v1/seller/upstream/:provider/connect` then `offers` with `lane: "chat"` (API keys only).
2. **HTTP agent hire:** register a provider endpoint with `harnessProfile` (`agent_harness`, framework, fresh/skills, `credentialClass`, optional `runtimeVersion`). Seller runs Claude Code / Grok Build / Codex / Openclaw / Hermes / Phantasy / custom on their machine. Vendor ToS risk is the seller’s when using consumer/CLI plans. Guide: [http-agent-guide.md](../sellers/http-agent-guide.md).

Platform `lane: "harness"` (shared gateway tool loop) remains available for ops but is **not** the primary seller UX.

| Layer                | Runs where       | Seller friction                                    |
| -------------------- | ---------------- | -------------------------------------------------- |
| Hosted chat          | Platform gateway | Paste upstream API key                             |
| HTTP agent           | Seller worker    | Endpoint + profile; optional plan/CLI on their box |
| Ops platform harness | Shared Phala     | Ops only                                           |

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

### 5. Integrity gates (enforced on verify)

When a provider reports `harnessProfile.lane=agent_harness`, verification runs `evaluateHarnessProfileIntegrity`:

- `installation=fresh` ⇒ skills must be empty
- `skill_augmented` ⇒ skills non-empty **and** `imageDigest` required
- if `compositionHash` is published, it must match a recompute

Failed integrity ⇒ verification `status: failed` with notes like `harness_image_digest_required`. Specialized agents cannot become marketplace-`verified` without a pinned image.

Buyers who need only attested specialized seats should set `requiredVerificationStatus: verified` plus `required_skills` / `allowed_installations`.

### 6. What is **not** proven today

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

| Variable                                    | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `BOSSRAID_HARNESS_MODE`                     | `codex` \| `grok` \| `glm` \| `chutes` \| `claude_code` \| `off` |
| `BOSSRAID_HARNESS_SKILLS`                   | Comma list `id` or `id@version` (empty = fresh)                  |
| `BOSSRAID_HARNESS_IMAGE_DIGEST`             | Optional image digest for stronger disclosure                    |
| `BOSSRAID_HARNESS_MAX_STEPS`                | Tool loop budget (default 10)                                    |
| `BOSSRAID_MODEL_API_BASE`                   | OpenAI or xAI base URL                                           |
| `BOSSRAID_MODEL_API_KEY` / `BOSSRAID_MODEL` | Upstream credentials                                             |

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

## Ops: run Claude Code harness

Claude Code here means **Claude models + Boss Raid's agent tool loop** (`agentFramework: claude_code`), not the Anthropic desktop/CLI binary on the CVM.

```bash
export BOSSRAID_HARNESS_MODE=claude_code
export BOSSRAID_MODEL_API_BASE=https://api.anthropic.com/v1
export BOSSRAID_MODEL=claude-sonnet-4-5
export BOSSRAID_MODEL_API_KEY=sk-ant-...
pnpm --filter @bossraid/provider-agent dev
```

Example env: `examples/providers/harness-claude-code.env.example`. Tier 0 sellers: `POST /v1/seller/upstream/anthropic/connect` then publish catalog ids like `anthropic/claude-sonnet-4-5` with `lane: "harness"`.

## Threads (not server-persisted)

Hosted inference and harness seats are **stateless across turns**:

- Chat completions expect the client to send the full `messages` history each call.
- Platform harness seats create an **ephemeral workspace per job**; they do not keep a long-lived conversation store for buyers.
- Mercenary UI thread lists are **browser-local** only.

Sellers do not need to implement thread storage. If a product later needs durable multi-turn memory, that belongs in a buyer/app layer or a dedicated platform store — not in the inference adapter.

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
