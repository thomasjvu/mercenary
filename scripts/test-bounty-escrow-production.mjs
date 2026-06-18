import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);

const maxUsd = Number(process.env.BOSSRAID_BOUNTY_ESCROW_E2E_MAX_USD ?? '1');
const rewardUsd = Number(process.env.BOSSRAID_BOUNTY_E2E_REWARD_USD ?? '0.1');

if (!Number.isFinite(rewardUsd) || rewardUsd <= 0 || rewardUsd > maxUsd) {
  throw new Error(
    `BOSSRAID_BOUNTY_E2E_REWARD_USD must be > 0 and <= BOSSRAID_BOUNTY_ESCROW_E2E_MAX_USD (${maxUsd}).`
  );
}

process.env.BOSSRAID_BOUNTY_E2E_MODE = 'wallet';
process.env.BOSSRAID_X402_E2E_MODE = 'wallet';

console.log(
  JSON.stringify(
    {
      step: 'production_rehearsal_start',
      apiBase:
        process.env.BOSSRAID_BOUNTY_E2E_API_BASE ??
        process.env.BOSSRAID_API_BASE ??
        process.env.VITE_BOSSRAID_API_BASE,
      rewardUsd,
      maxUsd,
      note: 'Uses real x402 wallet payments against the configured production API host.',
    },
    null,
    2
  )
);

const result = spawnSync('node', ['scripts/test-bounty-escrow-e2e.mjs'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}