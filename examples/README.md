# Examples

Fixtures, request samples, and operator worksheets for Boss Raid. Grouped by role — not a flat dump of every JSON file.

## Quick picks

| Use case                | Path                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Mercenary chat raid     | [`inference/chat-completion-request.json`](inference/chat-completion-request.json)                     |
| Native raid (Unity bug) | [`raids/unity-bug/task.json`](raids/unity-bug/task.json)                                               |
| Strict-private raid     | [`raids/strict-private/strict-private-raid.json`](raids/strict-private/strict-private-raid.json)       |
| Discount inference x402 | [`inference/inference-chat-completion-request.json`](inference/inference-chat-completion-request.json) |
| Game raid (GB Studio)   | [`raids/game-raid/native-raid.json`](raids/game-raid/native-raid.json)                                 |

```bash
curl -X POST http://127.0.0.1:8787/v1/raid \
  -H "content-type: application/json" \
  -d @examples/raids/strict-private/strict-private-raid.json
```

## Layout

| Folder                       | Contents                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| [`inference/`](inference/)   | Default marketplace catalog + chat request samples                                               |
| [`raids/`](raids/)           | Raid payloads and scenario provider fixtures (game, strict-private, unity-bug, Venice hackathon) |
| [`providers/`](providers/)   | Optional demo agent templates + seller registration JSON                                         |
| [`settlement/`](settlement/) | Bounty smoke providers, wallet address maps, Base mainnet proof env                              |
| [`onboarding/`](onboarding/) | Virtuals ACP capture worksheet                                                                   |
| [`campaigns/`](campaigns/)   | Party Quest / Forgejo operator campaign (`bossraid-development`)                                 |

## Dev defaults

`BOSSRAID_PROVIDERS_FILE` in [`.env.example`](../.env.example) points at:

```text
./examples/inference/inference-marketplace-providers.json
```

Refresh with `pnpm bossraid sync:inference-catalog` (also updates `packages/constants`).

## CI fixtures (do not repurpose)

These paths are wired into smoke tests — edit copies under `temp/`, not the repo fixtures:

| Test                            | Fixtures                                                              |
| ------------------------------- | --------------------------------------------------------------------- |
| `pnpm test:smoke:e2e`           | `raids/game-raid/`, `raids/strict-private/`                           |
| `pnpm test:bounty-escrow:local` | `settlement/bounty-e2e.providers.json`                                |
| `pnpm test:x402:e2e`            | `inference/chat-completion-request.json`, `raids/unity-bug/task.json` |

## Demo agents vs game-raid providers

Both use `gamma`, `dottie`, and `riko` ids but serve different purposes:

- **`providers/demo-agents.*.example`** — copy into `temp/demo-agents/` for local experimentation. See [`providers/README-demo-agents.md`](providers/README-demo-agents.md).
- **`raids/game-raid/providers.http.json`** — CI/e2e routing contract for the GB Studio demo. Do not replace with demo-agent copies.

## Campaign tooling

Party Quest operator scripts live under [`campaigns/bossraid-development/`](campaigns/bossraid-development/). Entry: `pnpm bossraid party-quest:smoke` (see [`scripts/README.md`](../scripts/README.md)).
