#!/usr/bin/env bash
set -euo pipefail

PHANTASY_AGENT_ROOT="${PHANTASY_AGENT_ROOT:-$HOME/bossraid-ops/phantasy-agent}"
ENV_DIR="${BOSSRAID_AGENT_ENV_DIR:-$HOME/bossraid-ops/workspaces/env}"
LOG_DIR="${BOSSRAID_LOG_DIR:-$HOME/bossraid-ops/logs}"

mkdir -p "${LOG_DIR}" "${ENV_DIR}"

agents=(
  "2200:bossraid-marketing"
  "2201:bossraid-research"
  "2202:bossraid-debug"
  "2203:bossraid-code"
)

cd "${PHANTASY_AGENT_ROOT}"

for spec in "${agents[@]}"; do
  port="${spec%%:*}"
  agent="${spec##*:}"
  env_file="${ENV_DIR}/${agent}.env"

  if curl -sf "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    echo "healthy ${agent} :${port}"
    continue
  fi

  (
    export AGENT_ID="${agent}"
    export AGENT_FRAMEWORK_URL="http://127.0.0.1:${port}"
    export PARTY_QUEST_ENABLE_ASSIGNMENTS=true
    export PARTY_QUEST_AUTO_RUN_WORKFLOWS=true
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
    export PORT="${port}"
    exec node dist/server.js
  ) > "${LOG_DIR}/${agent}.log" 2>&1 &

  echo "started ${agent} :${port}"
done