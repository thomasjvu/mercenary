#!/usr/bin/env bash
set -euo pipefail

# Run on spectre after party-quest convex deploy succeeds:
#   bash ~/bossraid-ops/mercenary/examples/campaigns/bossraid-development/spectre/finish-onboarding.sh

BOSSRAID_OPS="${BOSSRAID_OPS:-$HOME/bossraid-ops}"
BOSSRAID_REPO="${BOSSRAID_REPO:-$BOSSRAID_OPS/mercenary}"
PARTY_QUEST_DIR="${PARTY_QUEST_DIR:-$HOME/party-quest}"
SEED_FILE="${BOSSRAID_RUNTIME_SEED_FILE:-$BOSSRAID_OPS/runtime-agent-seed.json}"

echo "==> Pull latest mercenary development"
git -C "${BOSSRAID_REPO}" fetch origin development
git -C "${BOSSRAID_REPO}" checkout development
git -C "${BOSSRAID_REPO}" pull --ff-only origin development || true

echo "==> Bootstrap agents + Party Quest seeds"
bash "${BOSSRAID_REPO}/examples/campaigns/bossraid-development/spectre/bootstrap-agents.sh"

echo "==> Dogfood all four squads"
node "${BOSSRAID_REPO}/examples/campaigns/bossraid-development/scripts/dogfood-party-quest-bossraid.mjs" --pause-bridges --reseed

echo "==> Forgejo CI (re-trigger if needed)"
echo "Open https://forgejo.phantasy.bot/bossraid/mercenary/actions"