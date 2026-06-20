#!/usr/bin/env bash
set -euo pipefail

# Repairs bossraid seed block in party-quest and redeploys Convex.
# Run on spectre: bash ~/bossraid-ops/mercenary/examples/bossraid-development/spectre/redeploy-party-quest-seed.sh

PARTY_QUEST_DIR="${PARTY_QUEST_DIR:-$HOME/party-quest}"
SEED_FILE="${PARTY_QUEST_DIR}/convex/seed.ts"

python3 - <<'PY'
from pathlib import Path
p = Path.home() / "party-quest/convex/seed.ts"
text = p.read_text()
replacements = [
    (
        'const defaultBranch": "development"\'',
        "const defaultBranch = args.defaultBranch?.trim() || 'development'",
    ),
    (
        "const repoOwner = args.repoOwner?.trim() || 'oblivion';\n    const repoName = args.repoName?.trim() || 'oblivion';\n    const defaultBranch = args.defaultBranch?.trim() || 'development';\n    const repoUrl =\n      args.repoUrl?.trim() || `https://forgejo.phantasy.bot/${repoOwner}/${repoName}`;\n\n    const existing = await ctx.db\n      .query('campaigns')\n      .withIndex('by_party_slug', (q) =>\n        q.eq('partyId', partyId).eq('slug', 'bossraid-development'),",
        "const repoOwner = args.repoOwner?.trim() || 'bossraid';\n    const repoName = args.repoName?.trim() || 'mercenary';\n    const defaultBranch = args.defaultBranch?.trim() || 'development';\n    const repoUrl =\n      args.repoUrl?.trim() || `https://forgejo.phantasy.bot/${repoOwner}/${repoName}`;\n\n    const existing = await ctx.db\n      .query('campaigns')\n      .withIndex('by_party_slug', (q) =>\n        q.eq('partyId', partyId).eq('slug', 'bossraid-development'),",
    ),
]
for old, new in replacements:
    if old in text:
        text = text.replace(old, new, 1)
# GitHub triage quest inside bossraid block
marker = "slug: 'bossraid-development'"
idx = text.find(marker)
if idx != -1:
    segment = text[idx : idx + 12000]
    if "repoName: 'oblivion'" in segment and "repoOwner: 'thomasjvu'" in segment:
        fixed = segment.replace("repoName: 'oblivion'", "repoName: 'mercenary'", 1)
        text = text[:idx] + fixed + text[idx + 12000 :]
p.write_text(text)
print("patched", p)
PY

cd "${PARTY_QUEST_DIR}"
docker compose -f docker-compose.spectre.yml --env-file .env.self-hosted up --build -d convex-deploy
docker logs -f party-quest-convex-deploy-1 2>&1 | tail -20