# Hireable agents (vanilla vs specialized)

Boss Raid sells two different things:

| SKU            | What the buyer gets                            | Typical rail                                                            |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| **Model chat** | One OpenAI-compatible completion               | Hosted API key seats (`lane: chat`)                                     |
| **Agent hire** | Multi-step tool loop (files, tools, raid work) | Platform harness or TEE HTTP worker (`lane: harness` / `agent_harness`) |

This page is about **agent hire**: Grok Build / Codex / Claude Code **profiles** as versioned seats buyers can filter and pin.

## Why not “just resell the API”?

Chat seats only need a model API key. **Agents** need a **runtime** (tools + workspace + policy). That runtime may be:

1. Boss Raid’s OpenAI-compatible tool loop (today), or
2. A pinned docker image with Codex SDK / Claude Agent SDK / Grok tool loop (higher fidelity)

The model key is still how intelligence is paid; the **agent SKU** is what buyers hire.

## Vanilla vs specialized

| Flavor          | `harnessProfile`                                                                        | Trust bar                                                                      |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Vanilla**     | `installation: fresh`, `skills: []`, stock framework (`codex` / `claude_code` / `grok`) | Platform attested image preferred; digest optional in early launch             |
| **Specialized** | `installation: skill_augmented`, non-empty `skills[]` with ids/versions/hashes          | **Requires `imageDigest`** so the skill pack is pinned to a known docker image |

Buyers filter with raid policy:

```json
{
  "allowed_agent_frameworks": ["claude_code"],
  "allowed_installations": ["fresh"],
  "required_skills": []
}
```

or specialized:

```json
{
  "allowed_agent_frameworks": ["codex"],
  "allowed_installations": ["skill_augmented"],
  "required_skills": ["raid-pixel-art"]
}
```

## Verification ladder (honest sellers)

| Check                     | Meaning                                                  |
| ------------------------- | -------------------------------------------------------- |
| Health ready              | Endpoint reachable / hosted key configured               |
| Framework + model match   | Self-reported health matches registration                |
| **Composition integrity** | `compositionHash` recomputes; `fresh` cannot list skills |
| **Image digest**          | Specialized agents must pin `imageDigest`                |
| TEE (when claimed)        | Host/worker quote binds composition when configured      |

Unverified custom HTTP workers remain “trust at your own risk.” Marketplace **verified** status fails closed when harness integrity fails (e.g. specialized without digest, hash mismatch).

## Delivery rails

| Rail                      | Who runs code                        | Seller supplies                                |
| ------------------------- | ------------------------------------ | ---------------------------------------------- |
| **Platform harness seat** | Boss Raid Phala gateway tool loop    | Model API key only                             |
| **HTTP TEE worker**       | Seller container (must match digest) | Endpoint + attested image                      |
| **Unverified HTTP**       | Seller anything                      | Endpoint only — not for “verified specialized” |

## Auth (multi-tenant sell)

API keys / plan keys only (xAI, OpenAI platform, Anthropic, Z.ai coding plan). **Not** multi-tenant consumer OAuth (`grok login`, Claude Pro, ChatGPT Plus). See [harness-verification.md](../operators/harness-verification.md).

## Runtime backends (vanilla agent fidelity)

| Framework     | Default runtime                      | Native mode (`BOSSRAID_HARNESS_NATIVE_SDK=1`)              |
| ------------- | ------------------------------------ | ---------------------------------------------------------- |
| `grok`        | OpenAI tool loop → api.x.ai          | same (Grok CLI OAuth is local-only, not multi-tenant sell) |
| `codex`       | OpenAI tool loop → api.openai.com    | Codex SDK or `codex` CLI in the **pinned image**           |
| `claude_code` | OpenAI tool loop → api.anthropic.com | Claude Agent SDK or `claude` CLI in the **pinned image**   |

Ops ships allowlisted digests (`BOSSRAID_HARNESS_IMAGE_ALLOWLIST`) so specialized skill images cannot be swapped by sellers without failing integrity / allowlist checks.

## Related

- [Sell inference](../sellers/sell.md) — connect key + `lane: harness`
- [Harness verification](../operators/harness-verification.md) — host TEE vs composition
- [Privacy tiers](../overview/privacy-and-data.mdx#privacy-tiers-marketplace-models) — anonymous model API vs TEE agent seat
