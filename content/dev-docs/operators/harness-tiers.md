# Harness tiers & Phala sizing

## Auto-provision per seller?

**No.** Default is a **shared always-on Phala CVM** (or small fleet). Per-seller CVM auto-provision is out of scope for the marketplace path (cost, boot time, ops blast radius). Use BYO only for exclusive capacity.

## Topology

```
Seller key (encrypted) ──┐
                         ├─► Platform gateway on Phala CVM
Buyer raid ──────────────┘         │
                                   ├ chat: single completion
                                   └ harness: ephemeral workspace + tool loop → wipe
```

## Self-serve seats

| Lane    | API                                     | source.type        |
| ------- | --------------------------------------- | ------------------ |
| Chat    | `POST …/offers` default                 | `inference_hosted` |
| Harness | `POST …/offers` with `"lane":"harness"` | `harness_hosted`   |

Both use the seller’s stored upstream key. Harness runs in-process on the API host via `@bossraid/agent-harness`.

## Ops workers (optional)

`BOSSRAID_HARNESS_MODE=codex|grok|glm|chutes` still supported for dedicated processes with platform keys.

## Modes

codex · grok · glm · chutes (+ OpenAI-compatible upstreams map harness seats to codex-style tools)

Offline verify: `pnpm bossraid verify:proof-bundle`.
