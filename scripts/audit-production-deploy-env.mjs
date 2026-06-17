#!/usr/bin/env node
/**
 * Static deploy audit: fail when forbidden mock/dev env vars are set for production.
 * Usage: NODE_ENV=production node scripts/audit-production-deploy-env.mjs
 */

const FORBIDDEN_IN_PRODUCTION = [
  'BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND',
  'BOSSRAID_UPSTREAM_MOCK',
  'BOSSRAID_UPSTREAM_TEE_MOCK',
  'BOSSRAID_VENICE_MOCK',
  'BOSSRAID_REDPILL_MOCK',
  'BOSSRAID_NEAR_MOCK',
  'BOSSRAID_CHUTES_MOCK',
  'BOSSRAID_PHALA_MOCK',
  'BOSSRAID_PROVIDER_STUB_MODE',
  'BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION',
];

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function isTruthy(value) {
  return typeof value === 'string' && TRUTHY.has(value.trim().toLowerCase());
}

function main() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('audit-production-deploy-env: skipped (NODE_ENV is not production)');
    return;
  }

  const violations = FORBIDDEN_IN_PRODUCTION.filter((key) => isTruthy(process.env[key]));
  if (violations.length > 0) {
    console.error('Production deploy env audit failed. Unset these variables:');
    for (const key of violations) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  if (process.env.BOSSRAID_SETTLEMENT_MODE !== 'onchain') {
    console.error('Production deploy env audit failed: BOSSRAID_SETTLEMENT_MODE must be onchain.');
    process.exit(1);
  }

  if (process.env.BOSSRAID_X402_ENABLED !== 'true' && process.env.BOSSRAID_X402_ENABLED !== '1') {
    console.error('Production deploy env audit failed: BOSSRAID_X402_ENABLED must be true.');
    process.exit(1);
  }

  console.log('audit-production-deploy-env: pass');
}

main();