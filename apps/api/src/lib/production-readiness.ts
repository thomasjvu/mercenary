import { UPSTREAM_PROVIDER_CONFIG, type UpstreamProviderId } from '@bossraid/constants';
import { type ProviderHealthStatus, type ProviderProfile } from '@bossraid/shared-types';
import { readBooleanEnv } from './env.js';
import { readPlatformUpstreamApiKey } from './upstream/credentials.js';

type ProductionReadinessStatus = 'pass' | 'warn' | 'fail';
type ProductionReadinessSeverity = 'blocking' | 'warning' | 'info';

interface ProductionReadinessCheck {
  id: string;
  status: ProductionReadinessStatus;
  severity: ProductionReadinessSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export function buildProductionReadinessReport(input: {
  env: NodeJS.ProcessEnv;
  storageBackend: 'sqlite' | 'memory';
  persistenceHealthy: boolean;
  providers: ProviderProfile[];
  providerHealth: ProviderHealthStatus[];
  x402: {
    enabled: boolean;
    facilitatorConfigured: boolean;
    payToConfigured: boolean;
    network: string;
    asset: string;
  };
  settlement: {
    mode: string;
    configured: boolean;
  };
  tee: {
    configured: boolean;
    platform: string | null;
    pathExists: boolean;
    socketMounted: boolean;
  };
  limits: {
    publicRateLimitMax: number;
    publicRateLimitWindowMs: number;
    buyerKeyRateLimitMax: number;
    buyerKeyRateLimitWindowMs: number;
    buyerKeyDefaultSpendLimitUsd?: number;
    buyerMaxRequestBudgetUsd?: number;
  };
  workerIsolation: 'per_job_process' | 'per_job_container';
}) {
  const checks: ProductionReadinessCheck[] = [];
  const verifiedProviders = input.providers.filter(
    (provider) => provider.verification?.status === 'verified'
  );
  const readyProviders = input.providerHealth.filter((provider) => provider.ready);

  const addCheck = (check: ProductionReadinessCheck) => {
    checks.push(check);
  };

  addCheck({
    id: 'node_env_production',
    status: input.env.NODE_ENV === 'production' ? 'pass' : 'fail',
    severity: 'blocking',
    message:
      input.env.NODE_ENV === 'production'
        ? 'API is running with NODE_ENV=production.'
        : 'Set NODE_ENV=production before public paid traffic.',
  });

  addCheck({
    id: 'storage_backend',
    status: input.storageBackend === 'memory' || !input.persistenceHealthy ? 'fail' : 'warn',
    severity:
      input.storageBackend === 'memory' || !input.persistenceHealthy ? 'blocking' : 'warning',
    message:
      input.storageBackend === 'memory'
        ? 'Memory storage is not acceptable for production.'
        : input.storageBackend === 'sqlite'
          ? 'SQLite is acceptable for controlled launch only; full production needs managed durable SQL, backups, and restore drills.'
          : 'File storage is acceptable for controlled launch only; full production needs managed durable SQL, backups, and restore drills.',
    details: {
      backend: input.storageBackend,
      healthy: input.persistenceHealthy,
    },
  });

  addCheck({
    id: 'secret_encryption',
    status:
      input.storageBackend === 'memory' ||
      hasStrongOperationalSecret(
        input.env.BOSSRAID_SECRET_ENCRYPTION_KEY ?? input.env.BOSSRAID_ENCRYPTION_KEY
      )
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      input.storageBackend === 'memory'
        ? 'Memory storage does not persist encrypted secrets.'
        : 'BOSSRAID_SECRET_ENCRYPTION_KEY is required for persisted provider auth, sessions, nonces, and buyer key hashes.',
    details: {
      keyId: input.env.BOSSRAID_SECRET_ENCRYPTION_KEY_ID ?? null,
      previousKeysConfigured: Boolean(input.env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS?.trim()),
    },
  });

  addCheck({
    id: 'admin_auth',
    status: hasStrongOperationalSecret(input.env.BOSSRAID_ADMIN_TOKEN) ? 'pass' : 'fail',
    severity: 'blocking',
    message: 'BOSSRAID_ADMIN_TOKEN must be a long non-placeholder secret.',
  });

  addCheck({
    id: 'registry_auth',
    status: hasStrongOperationalSecret(input.env.BOSSRAID_REGISTRY_TOKEN) ? 'pass' : 'fail',
    severity: 'blocking',
    message: 'BOSSRAID_REGISTRY_TOKEN must be configured for authenticated registry operations.',
  });

  addCheck({
    id: 'x402_payment',
    status:
      !input.x402.enabled || (input.x402.facilitatorConfigured && input.x402.payToConfigured)
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message: input.x402.enabled
      ? 'x402 must have facilitator and pay-to wallet configured.'
      : 'x402 is disabled; only use this for private rehearsal environments.',
    details: input.x402,
  });

  const productionEnv = input.env.NODE_ENV === 'production';
  addCheck({
    id: 'unverified_balance_fund',
    status:
      !productionEnv || !readBooleanEnv(input.env.BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND)
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      'BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND must stay disabled in production. Balance top-ups require verified x402 payments.',
    details: {
      allowUnverifiedBalanceFund: readBooleanEnv(input.env.BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND),
    },
  });

  addCheck({
    id: 'unverified_bounty_fund',
    status:
      !productionEnv || !readBooleanEnv(input.env.BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND)
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      'BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND must stay disabled in production. Bounty funding requires verified x402 payments.',
    details: {
      allowUnverifiedBountyFund: readBooleanEnv(input.env.BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND),
    },
  });

  const enabledMocks = readEnabledUpstreamMocks(input.env);
  addCheck({
    id: 'upstream_mocks_disabled',
    status: !productionEnv || enabledMocks.length === 0 ? 'pass' : 'fail',
    severity: 'blocking',
    message: 'Upstream inference, TEE, and provider stub mocks must be disabled in production.',
    details: { enabledMocks },
  });

  addCheck({
    id: 'onchain_settlement',
    status: input.settlement.configured ? 'pass' : 'fail',
    severity: 'blocking',
    message:
      input.settlement.mode === 'onchain'
        ? 'Onchain settlement requires RPC, chain id, contracts, client signer, and evaluator address.'
        : 'Full production requires BOSSRAID_SETTLEMENT_MODE=onchain.',
    details: {
      mode: input.settlement.mode,
      configured: input.settlement.configured,
    },
  });

  const settlementFundJobsEnabled = readBooleanEnv(input.env.BOSSRAID_SETTLEMENT_FUND_JOBS);
  addCheck({
    id: 'settlement_fund_jobs',
    status:
      !productionEnv || input.settlement.mode !== 'onchain' || settlementFundJobsEnabled
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      'BOSSRAID_SETTLEMENT_FUND_JOBS must be true in production onchain mode so successful child jobs receive escrow funding.',
    details: {
      settlementFundJobs: settlementFundJobsEnabled,
      settlementMode: input.settlement.mode,
    },
  });

  const requireTerminalJobs = readBooleanEnv(input.env.BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS);
  addCheck({
    id: 'settlement_terminal_jobs',
    status:
      !productionEnv || input.settlement.mode !== 'onchain' || requireTerminalJobs
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      'BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS must be true in production onchain mode before parent finalize.',
    details: {
      requireTerminalJobs,
      settlementMode: input.settlement.mode,
    },
  });

  const bountyEscrowConfigured = Boolean(input.env.BOSSRAID_BOUNTY_ESCROW_ADDRESS?.trim());
  addCheck({
    id: 'bounty_escrow_configured',
    status: input.settlement.mode !== 'onchain' || bountyEscrowConfigured ? 'pass' : 'fail',
    severity: 'blocking',
    message:
      input.settlement.mode === 'onchain'
        ? 'Onchain bounty funding requires BOSSRAID_BOUNTY_ESCROW_ADDRESS.'
        : 'Bounty escrow contract is only required when settlement mode is onchain.',
    details: {
      bountyEscrowAddress: input.env.BOSSRAID_BOUNTY_ESCROW_ADDRESS ?? null,
    },
  });

  addCheck({
    id: 'tee_attestation',
    status:
      input.tee.configured &&
      input.tee.platform === 'phala' &&
      input.tee.pathExists &&
      input.tee.socketMounted
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message: 'Phala TEE signer and tappd socket must be available for strict-private production.',
    details: input.tee,
  });

  addCheck({
    id: 'evaluator_isolation',
    status:
      input.workerIsolation === 'per_job_container' &&
      !readBooleanEnv(input.env.BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION)
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      'Production evaluator jobs must run in per-job containers without unsafe host execution.',
    details: {
      workerIsolation: input.workerIsolation,
      unsafeHostExecution: readBooleanEnv(input.env.BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION),
    },
  });

  addCheck({
    id: 'provider_pool',
    status:
      readyProviders.length > 0 && verifiedProviders.length > 0
        ? 'pass'
        : readyProviders.length > 0
          ? 'warn'
          : 'fail',
    severity: readyProviders.length > 0 ? 'warning' : 'blocking',
    message:
      'Production requires at least one ready provider and should have multiple verified sellers per active market.',
    details: {
      providers: input.providers.length,
      readyProviders: readyProviders.length,
      verifiedProviders: verifiedProviders.length,
    },
  });

  addCheck({
    id: 'abuse_controls',
    status:
      input.limits.publicRateLimitMax > 0 &&
      input.limits.buyerKeyRateLimitMax > 0 &&
      input.limits.buyerKeyDefaultSpendLimitUsd != null &&
      input.limits.buyerMaxRequestBudgetUsd != null
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      'Public launch requires IP limits, per-key limits, default spend caps, and max request budget.',
    details: input.limits,
  });

  addCheck({
    id: 'operator_trust_ack',
    status:
      readBooleanEnv(input.env.BOSSRAID_OPERATOR_TERMS_ACK) &&
      readBooleanEnv(input.env.BOSSRAID_INCIDENT_RESPONSE_ACK)
        ? 'pass'
        : 'fail',
    severity: 'blocking',
    message:
      'Operators must acknowledge clean-endpoint seller terms and incident-response ownership before full production.',
  });

  const configuredUpstreamProviders = (
    Object.keys(UPSTREAM_PROVIDER_CONFIG) as UpstreamProviderId[]
  ).filter((provider) => readPlatformUpstreamApiKey(provider, input.env));
  addCheck({
    id: 'platform_upstream_keys',
    status: configuredUpstreamProviders.length > 0 ? 'pass' : 'warn',
    severity: 'warning',
    message:
      configuredUpstreamProviders.length > 0
        ? 'At least one platform BOSSRAID_*_API_KEY is configured for catalog inference.'
        : 'Configure platform BOSSRAID_*_API_KEY values for catalog inference and TEE preflight.',
    details: {
      configuredProviders: configuredUpstreamProviders,
    },
  });

  addCheck({
    id: 'observability',
    status: 'pass',
    severity: 'info',
    message: 'JSON metrics are available at /v1/ops/metrics and Prometheus metrics at /metrics.',
    details: {
      metricsPublic: readBooleanEnv(input.env.BOSSRAID_METRICS_PUBLIC),
    },
  });

  const blockingFailures = checks.filter(
    (check) => check.status === 'fail' && check.severity === 'blocking'
  );
  const warnings = checks.filter((check) => check.status === 'warn');

  return {
    ok: blockingFailures.length === 0,
    status: blockingFailures.length === 0 ? 'ready' : 'blocked',
    generatedAt: new Date().toISOString(),
    summary: {
      checks: checks.length,
      blockingFailures: blockingFailures.length,
      warnings: warnings.length,
    },
    checks,
    nextActions: blockingFailures.map((check) => ({
      check: check.id,
      action: check.message,
    })),
  };
}

const UPSTREAM_MOCK_ENV_KEYS = [
  'BOSSRAID_UPSTREAM_MOCK',
  'BOSSRAID_UPSTREAM_TEE_MOCK',
  'BOSSRAID_VENICE_MOCK',
  'BOSSRAID_REDPILL_MOCK',
  'BOSSRAID_NEAR_MOCK',
  'BOSSRAID_CHUTES_MOCK',
  'BOSSRAID_PHALA_MOCK',
  'BOSSRAID_PROVIDER_STUB_MODE',
] as const;

export function readEnabledUpstreamMocks(env: NodeJS.ProcessEnv): string[] {
  return UPSTREAM_MOCK_ENV_KEYS.filter((key) => readBooleanEnv(env[key]));
}

export function hasStrongOperationalSecret(value: string | undefined, minLength = 32): boolean {
  if (!value?.trim()) {
    return false;
  }

  const trimmed = value.trim();
  return (
    trimmed.length >= minLength &&
    !/^<.+>$/u.test(trimmed) &&
    !/replace|changeme|todo|your-org/iu.test(trimmed)
  );
}
