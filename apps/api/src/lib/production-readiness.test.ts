import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductionReadinessReport } from './production-readiness.js';

const baseInput = {
  env: {
    NODE_ENV: 'production',
    BOSSRAID_OPERATOR_TERMS_ACK: 'true',
    BOSSRAID_INCIDENT_RESPONSE_ACK: 'true',
    BOSSRAID_ADMIN_TOKEN: 'a'.repeat(40),
    BOSSRAID_REGISTRY_TOKEN: 'b'.repeat(40),
    BOSSRAID_SECRET_ENCRYPTION_KEY: 'c'.repeat(40),
    BOSSRAID_SETTLEMENT_MODE: 'onchain',
    BOSSRAID_SETTLEMENT_FUND_JOBS: 'true',
    BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS: 'true',
    BOSSRAID_BOUNTY_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000201',
    MNEMONIC: 'test test test test test test test test test test test junk',
    BOSSRAID_TEE_PLATFORM: 'phala',
  },
  storageBackend: 'sqlite' as const,
  persistenceHealthy: true,
  providers: [{ providerId: 'p1', verification: { status: 'verified' } } as never],
  providerHealth: [{ providerId: 'p1', ready: true } as never],
  x402: {
    enabled: true,
    facilitatorConfigured: true,
    payToConfigured: true,
    network: 'base-sepolia',
    asset: 'USDC',
  },
  settlement: { mode: 'onchain', configured: true },
  tee: {
    configured: true,
    platform: 'phala',
    pathExists: true,
    socketMounted: true,
  },
  limits: {
    publicRateLimitMax: 100,
    publicRateLimitWindowMs: 60_000,
    buyerKeyRateLimitMax: 100,
    buyerKeyRateLimitWindowMs: 60_000,
    buyerKeyDefaultSpendLimitUsd: 25,
    buyerMaxRequestBudgetUsd: 10,
  },
  workerIsolation: 'per_job_container' as const,
};

test('production readiness blocks missing settlement fund jobs', () => {
  const report = buildProductionReadinessReport({
    ...baseInput,
    env: {
      ...baseInput.env,
      BOSSRAID_SETTLEMENT_FUND_JOBS: 'false',
    },
  });
  const check = report.checks.find((entry) => entry.id === 'settlement_fund_jobs');
  assert.equal(check?.status, 'fail');
  assert.equal(report.ok, false);
});

test('production readiness blocks unverified bounty fund bypass', () => {
  const report = buildProductionReadinessReport({
    ...baseInput,
    env: {
      ...baseInput.env,
      BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND: 'true',
    },
  });
  const check = report.checks.find((entry) => entry.id === 'unverified_bounty_fund');
  assert.equal(check?.status, 'fail');
  assert.equal(report.ok, false);
});
