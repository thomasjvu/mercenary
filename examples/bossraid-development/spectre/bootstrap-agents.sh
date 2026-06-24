#!/usr/bin/env bash
set -euo pipefail

# Run on spectre.thomasjvu.com
#   bash ~/bossraid-ops/mercenary/examples/bossraid-development/spectre/bootstrap-agents.sh

BOSSRAID_OPS="${BOSSRAID_OPS:-$HOME/bossraid-ops}"
PARTY_QUEST_DIR="${PARTY_QUEST_DIR:-$HOME/party-quest}"
PHANTASY_AGENT_ROOT="${PHANTASY_AGENT_ROOT:-$HOME/bossraid-ops/phantasy-agent}"
BOSSRAID_REPO="${BOSSRAID_REPO:-$BOSSRAID_OPS/mercenary}"
WORKSPACES="${BOSSRAID_WORKSPACES:-$BOSSRAID_OPS/workspaces}"
SEED_FILE="${BOSSRAID_RUNTIME_SEED_FILE:-$BOSSRAID_OPS/runtime-agent-seed.json}"
TEMPLATE_ROOT="${BOSSRAID_REPO}/examples/bossraid-development/workspaces"

echo "==> Ensure Boss Raid repo"
if [ ! -d "${BOSSRAID_REPO}/.git" ]; then
  git clone https://forgejo.phantasy.bot/bossraid/mercenary.git "${BOSSRAID_REPO}"
fi
git -C "${BOSSRAID_REPO}" fetch origin development
git -C "${BOSSRAID_REPO}" checkout development
git -C "${BOSSRAID_REPO}" pull --ff-only origin development || true

echo "==> Ensure Phantasy agent checkout"
if [ ! -d "${PHANTASY_AGENT_ROOT}/.git" ]; then
  git clone https://github.com/phantasy-ai/phantasy.git "${PHANTASY_AGENT_ROOT}" 2>/dev/null || \
    cp -R "${HOME}/alkahest-ops/phantasy-agent" "${PHANTASY_AGENT_ROOT}"
fi

echo "==> Install Phantasy agent configs"
mkdir -p "${PHANTASY_AGENT_ROOT}/config/agents"
cp "${BOSSRAID_REPO}/examples/bossraid-development/phantasy-agent-configs/"*.json \
  "${PHANTASY_AGENT_ROOT}/config/agents/" 2>/dev/null || true

echo "==> Ensure workspaces"
mkdir -p "${WORKSPACES}"/{phantasy,hermes,openclaw,opencode,env}
for framework in phantasy hermes openclaw opencode; do
  cp "${TEMPLATE_ROOT}/shared/AGENTS.md" "${WORKSPACES}/${framework}/AGENTS.md"
  cp "${TEMPLATE_ROOT}/shared/HEARTBEAT.md" "${WORKSPACES}/${framework}/HEARTBEAT.md"
  cp "${TEMPLATE_ROOT}/${framework}/party-quest.adapter.json" \
    "${WORKSPACES}/${framework}/party-quest.adapter.json"
done

echo "==> Forgejo agent users"
if [ -n "${FORGEJO_TOKEN:-}" ]; then
  FORGEJO_TOKEN="${FORGEJO_TOKEN}" WORKSPACE_ENV_DIR="${WORKSPACES}/env" \
    node "${BOSSRAID_REPO}/examples/bossraid-development/scripts/setup-forgejo-agent-users.mjs"
else
  echo "warn: FORGEJO_TOKEN not set — skip agent user provisioning"
fi

echo "==> Seed Boss Raid runtime agents + campaign"
cd "${PARTY_QUEST_DIR}"
set -a
source .env.self-hosted
set +a
SEED_JSON="$(npx convex run seed:seedBossraidRuntimeAgents)"
printf '%s\n' "${SEED_JSON}" > "${SEED_FILE}"
npx convex run seed:seedBossraidDevelopment
echo "Saved seed evidence: ${SEED_FILE}"

echo "==> Start agent runtimes (host Node — docker agents need Postgres)"
PHANTASY_AGENT_ROOT="${PHANTASY_AGENT_ROOT}" \
BOSSRAID_AGENT_ENV_DIR="${WORKSPACES}/env" \
BOSSRAID_LOG_DIR="${BOSSRAID_OPS}/logs" \
  bash "${BOSSRAID_REPO}/examples/bossraid-development/spectre/start-agents.sh"

echo "==> Wait for health"
for port in 2200 2201 2202 2203; do
  for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      echo "  :${port} healthy"
      break
    fi
    sleep 2
  done
done

echo "==> Register agents"
BOSSRAID_REPO="${BOSSRAID_REPO}" \
BOSSRAID_RUNTIME_SEED_FILE="${SEED_FILE}" \
  bash "${BOSSRAID_REPO}/examples/bossraid-development/spectre/register-all-bossraid-agents.sh"

echo "Done. Dogfood: node ${BOSSRAID_REPO}/examples/bossraid-development/scripts/dogfood-party-quest-bossraid.mjs --pause-bridges --reseed"