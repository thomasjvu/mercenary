#!/usr/bin/env node
/**
 * Health preflight for Boss Raid Party Quest agent registration on Spectre.
 */

const seedFile =
  process.env.BOSSRAID_RUNTIME_SEED_FILE?.trim() ||
  `${process.env.HOME}/bossraid-ops/runtime-agent-seed.json`;
const partyQuestUrl =
  process.env.PARTY_QUEST_URL?.trim() || 'https://party-convex-site.phantasy.bot';
const phantasyAgentRoot =
  process.env.PHANTASY_AGENT_ROOT?.trim() || `${process.env.HOME}/bossraid-ops/phantasy-agent`;

const ports = [
  { frameworkId: 'bossraid-phantasy-agent', port: 2200 },
  { frameworkId: 'bossraid-hermes-agent', port: 2201 },
  { frameworkId: 'bossraid-openclaw-agent', port: 2202 },
  { frameworkId: 'bossraid-opencode-agent', port: 2203 },
];

async function checkHealth(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { ok: false, mode: 'down' };
    const body = await response.json().catch(() => ({}));
    return { ok: true, mode: body.status === 'ok' ? 'phantasy' : 'bridge' };
  } catch {
    return { ok: false, mode: 'down' };
  }
}

async function main() {
  console.log('Boss Raid Party Quest agent registration preflight');
  console.log(`  Party Quest URL: ${partyQuestUrl}`);
  console.log(`  Seed evidence:   ${seedFile}`);
  console.log(`  Phantasy root:   ${phantasyAgentRoot}`);
  console.log('');

  const health = await Promise.all(
    ports.map(async (entry) => ({ ...entry, ...(await checkHealth(entry.port)) })),
  );

  for (const entry of health) {
    console.log(
      `  ${entry.frameworkId} :${entry.port}/health -> ${entry.ok ? `OK (${entry.mode})` : 'DOWN'}`,
    );
  }

  if (health.some((entry) => !entry.ok)) {
    console.error('\nStart all runtimes before registration.');
    process.exit(1);
  }

  console.log('\nRun on Spectre:');
  console.log(
    `  bash ${process.env.HOME}/bossraid-ops/mercenary/examples/bossraid-development/spectre/register-all-bossraid-agents.sh`,
  );
  console.log('\nThen re-seed:');
  console.log('  cd ~/party-quest && npx convex run seed:seedBossraidDevelopment');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});