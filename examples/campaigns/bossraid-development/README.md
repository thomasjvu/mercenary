# Boss Raid Development Campaign

Party Quest campaign fixtures and portable scripts for multi-agent squads on the Boss Raid monorepo.

## In this repo

| Path                         | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `scripts/`                   | Forgejo setup, dogfood, smoke tests (`pnpm bossraid party-quest:smoke`) |
| `phantasy-agent-configs/`    | Agent JSON templates copied to a Phantasy runtime on the host           |
| `workspaces/`                | Shared `AGENTS.md` / adapter JSON per framework                         |
| `.party-quest/campaign.json` | Campaign seed payload reference                                         |

## Host bootstrap (not in git)

One-time Linux host runbooks (clone repos, seed Convex, start agent ports 2200–2203) belong in **`deploy/ops-local/`** (gitignored). See [`deploy/ops-local.example/README.md`](../../../deploy/ops-local.example/README.md).

Do not commit hostnames, tokens, or `runtime-agent-seed.json`.

## Smoke gate

```bash
node examples/campaigns/bossraid-development/scripts/dogfood-party-quest-bossraid.mjs --pause-bridges --reseed
node examples/campaigns/bossraid-development/scripts/test-party-quest-bossraid-smoke.mjs
```

Or: `pnpm bossraid party-quest:smoke`

Evidence: `evidence/party-quest/bossraid-development-smoke-YYYY-MM-DD.jsonl`

## Forgejo setup (optional)

```bash
FORGEJO_TOKEN=<admin> GITHUB_TOKEN=<token> node examples/campaigns/bossraid-development/scripts/setup-forgejo-ops.mjs
FORGEJO_TOKEN=<admin> node examples/campaigns/bossraid-development/scripts/setup-forgejo-agent-users.mjs
```

Override `FORGEJO_BASE_URL`, `GITHUB_REPO`, and `WORKSPACE_ENV_DIR` for your environment.

## Squad map

| Squad     | Agent config id      | Party Quest framework id  | Port |
| --------- | -------------------- | ------------------------- | ---- |
| Code      | `bossraid-code`      | `bossraid-opencode-agent` | 2203 |
| Debug     | `bossraid-debug`     | `bossraid-openclaw-agent` | 2202 |
| Marketing | `bossraid-marketing` | `bossraid-phantasy-agent` | 2200 |
| Research  | `bossraid-research`  | `bossraid-hermes-agent`   | 2201 |

Ports 2200–2203 are conventions for this campaign; pick non-conflicting ports on your host.
