# Operator-local deploy (not in git)

`deploy/ops-local/` is gitignored. Keep host-specific Party Quest / agent bootstrap runbooks there — not in `examples/`.

## Layout

```text
deploy/ops-local/
  bossraid-development/
    spectre/          # or rename to host/ — your choice locally
      bootstrap-agents.sh
      start-agents.sh
      register-all-bossraid-agents.sh
      finish-onboarding.sh
      redeploy-party-quest-seed.sh
      docker-compose.agents.yml
```

## What these scripts do

One-time / maintenance operator runbooks for a self-hosted Linux host running:

- Boss Raid repo checkout
- Party Quest (Convex self-hosted)
- Four Phantasy agent runtimes (ports 2200–2203)
- Forgejo agent user provisioning

Portable campaign tooling stays in [`examples/campaigns/bossraid-development/`](../../examples/campaigns/bossraid-development/) (`dogfood`, `smoke`, Forgejo setup scripts).

## First-time setup

If you previously had runbooks under `examples/campaigns/bossraid-development/spectre/`, move or copy them here. Set env vars for your host (no hostname baked into scripts):

| Variable              | Purpose                                 |
| --------------------- | --------------------------------------- |
| `BOSSRAID_OPS`        | Base ops dir (default `~/bossraid-ops`) |
| `BOSSRAID_REPO`       | Mercenary checkout                      |
| `PARTY_QUEST_DIR`     | Party Quest repo                        |
| `PHANTASY_AGENT_ROOT` | Phantasy agent runtime                  |
| `FORGEJO_TOKEN`       | Forgejo admin API token                 |
| `PARTY_QUEST_URL`     | Party Quest Convex site URL             |
| `FORGEJO_BASE_URL`    | Forgejo base URL                        |

Never commit tokens, `.env.self-hosted`, or `runtime-agent-seed.json` into this repo.
