#!/usr/bin/env node
/**
 * Static deploy audit: fail when forbidden mock/dev env vars are set for production.
 * Usage: NODE_ENV=production node scripts/audit-production-deploy-env.mjs
 */

const FORBIDDEN_IN_PRODUCTION = [
  'BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND',
  'BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND',
  'BOSSRAID_UPSTREAM_MOCK',
  'BOSSRAID_UPSTREAM_TEE_MOCK',
  'BOSSRAID_VENICE_MOCK',
  'BOSSRAID_REDPILL_MOCK',
  'BOSSRAID_NEAR_MOCK',
  'BOSSRAID_CHUTES_MOCK',
  'BOSSRAID_PHALA_MOCK',
  'BOSSRAID_XAI_MOCK',
  'BOSSRAID_ZAI_MOCK',
  'BOSSRAID_ANTHROPIC_MOCK',
  'BOSSRAID_NEBIUS_MOCK',
  'BOSSRAID_OPENAI_MOCK',
  'BOSSRAID_PROVIDER_STUB_MODE',
  'BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION',
];

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function isTruthy(value) {
  return typeof value === 'string' && TRUTHY.has(value.trim().toLowerCase());
}

function main() {
  if (process.env.NODE_ENV !== 'production') {
    console.error('Production deploy env audit failed: NODE_ENV must be production.');
    process.exit(1);
  }

  const violations = FORBIDDEN_IN_PRODUCTION.filter((key) => isTruthy(process.env[key]));
  if (violations.length > 0) {
    console.error('Production deploy env audit failed. Unset these variables:');
    for (const key of violations) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  if (
    process.env.BOSSRAID_PRIVACY_SERVER_VERIFY === '0' ||
    process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY === '1'
  ) {
    console.error(
      'Production deploy env audit failed: server privacy and Phala Cloud verification must remain enabled.'
    );
    process.exit(1);
  }

  if (process.env.BOSSRAID_SETTLEMENT_MODE !== 'onchain') {
    console.error('Production deploy env audit failed: BOSSRAID_SETTLEMENT_MODE must be onchain.');
    process.exit(1);
  }

  const usdgAddress = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
  const paymentNetwork = process.env.BOSSRAID_X402_NETWORK ?? 'eip155:4663';
  const paymentAsset = (process.env.BOSSRAID_X402_ASSET ?? 'usdg').toLowerCase();
  if (
    process.env.BOSSRAID_CHAIN_ID !== '4663' ||
    process.env.BOSSRAID_TOKEN_ADDRESS?.toLowerCase() !== usdgAddress ||
    paymentNetwork !== 'eip155:4663' ||
    (paymentAsset !== 'usdg' && paymentAsset !== usdgAddress)
  ) {
    console.error(
      'Production deploy env audit failed: settlement and x402 require exact Robinhood mainnet (4663) + USDG.'
    );
    process.exit(1);
  }

  if (process.env.BOSSRAID_X402_ENABLED !== 'true' && process.env.BOSSRAID_X402_ENABLED !== '1') {
    console.error('Production deploy env audit failed: BOSSRAID_X402_ENABLED must be true.');
    process.exit(1);
  }

  if (!isTruthy(process.env.BOSSRAID_SETTLEMENT_FUND_JOBS)) {
    console.error(
      'Production deploy env audit failed: BOSSRAID_SETTLEMENT_FUND_JOBS must be true.'
    );
    process.exit(1);
  }

  if (!isTruthy(process.env.BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS)) {
    console.error(
      'Production deploy env audit failed: BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS must be true.'
    );
    process.exit(1);
  }

  if (!process.env.BOSSRAID_BOUNTY_ESCROW_ADDRESS?.trim()) {
    console.error(
      'Production deploy env audit failed: BOSSRAID_BOUNTY_ESCROW_ADDRESS must be configured.'
    );
    process.exit(1);
  }

  if (!process.env.BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET?.trim()) {
    console.error(
      'Production deploy env audit failed: BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET must be configured.'
    );
    process.exit(1);
  }

  if (
    !process.env.BOSSRAID_SECRET_ENCRYPTION_KEY?.trim() &&
    !process.env.BOSSRAID_ENCRYPTION_KEY?.trim()
  ) {
    console.error(
      'Production deploy env audit failed: BOSSRAID_SECRET_ENCRYPTION_KEY or BOSSRAID_ENCRYPTION_KEY must be configured.'
    );
    process.exit(1);
  }

  console.log('audit-production-deploy-env: pass');
}

main();
