# Boss Raid Development Campaign

Party Quest campaign for general-purpose agent squads on the Boss Raid monorepo.

## Canonical source

- **Forgejo**: `https://forgejo.phantasy.bot/bossraid/mercenary`
- **GitHub mirror**: `https://github.com/thomasjvu/mercenary`

## Squad map

| Squad     | Agent config id      | Party Quest framework id    | Port |
| --------- | -------------------- | --------------------------- | ---- |
| Code      | `bossraid-code`      | `bossraid-opencode-agent`   | 2203 |
| Debug     | `bossraid-debug`     | `bossraid-openclaw-agent`   | 2202 |
| Marketing | `bossraid-marketing` | `bossraid-phantasy-agent`   | 2200 |
| Research  | `bossraid-research`  | `bossraid-hermes-agent`     | 2201 |

Ports 2200–2203 avoid collision with Alkahest (2000–2003) and Oblivion (2100–2103).

## Forgejo setup

```bash
FORGEJO_TOKEN=<admin> GITHUB_TOKEN=<token> node scripts/setup-forgejo-ops.mjs
FORGEJO_TOKEN=<admin> node scripts/setup-forgejo-agent-users.mjs
```

## Party Quest seed (on Spectre)

```bash
cd ~/party-quest
set -a && source .env.self-hosted && set +a
npx convex run seed:seedBossraidRuntimeAgents
npx convex run seed:seedBossraidDevelopment
```

## Spectre bootstrap

```bash
bash examples/bossraid-development/spectre/bootstrap-agents.sh
```

## Smoke gate

```bash
node scripts/dogfood-party-quest-bossraid.mjs --pause-bridges --reseed
node scripts/test-party-quest-bossraid-smoke.mjs
```

Evidence: `evidence/party-quest/bossraid-development-smoke-YYYY-MM-DD.jsonl`