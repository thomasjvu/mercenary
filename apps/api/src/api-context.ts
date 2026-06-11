import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { type BossRaidOrchestrator } from '@bossraid/orchestrator';
import { DEFAULTS } from '@bossraid/constants';
import { type Erc8004Identity } from '@bossraid/shared-types';
import { createApiControlState, type ApiControlState } from './control-state.js';
import { createErc8004Verifier } from './erc8004.js';
import { createSettlementProofRefresher } from './settlement-proof.js';
import { createApiMetrics, type ApiMetrics } from './lib/metrics.js';
import {
  DEFAULT_PUBLIC_SESSION_TTL_SEC,
  readPositiveInteger,
  readPositiveNumber,
  readBooleanEnv,
  resolveChatTerminalSettleGraceMs,
} from './lib/env.js';
import { readTeeSigner, readMercenaryErc8004Identity } from './lib/tee.js';

export type ApiContext = {
  orchestrator: BossRaidOrchestrator;
  env: NodeJS.ProcessEnv;
  app: FastifyInstance;
  adminToken: string | undefined;
  demoRouteEnabled: boolean;
  demoToken: string | undefined;
  apiBodyLimitBytes: number;
  providerSubmissionBodyLimitBytes: number;
  opsSessionTtlSec: number;
  publicSessionTtlSec: number;
  publicAuthNonceTtlSec: number;
  buyerKeyDefaultSpendLimitUsd: number | undefined;
  buyerMaxRequestBudgetUsd: number | undefined;
  buyerKeyRateLimitMax: number;
  buyerKeyRateLimitWindowMs: number;
  publicRateLimitMax: number;
  publicRateLimitWindowMs: number;
  opsSessionRateLimitMax: number;
  opsSessionRateLimitWindowMs: number;
  providerHealthTimeoutMs: number;
  chatDefaultMaxTotalCost: number | undefined;
  chatTerminalSettleGraceMs: number;
  evaluatorMaxConcurrentJobs: number;
  registryToken: string | undefined;
  mercenaryIdentity: Erc8004Identity | undefined;
  trustProxy: boolean;
  teeSigner: ReturnType<typeof readTeeSigner>;
  erc8004Verifier: ReturnType<typeof createErc8004Verifier>;
  settlementProofRefresher: ReturnType<typeof createSettlementProofRefresher>;
  controlState: ApiControlState;
  workerIsolation: 'per_job_container' | 'per_job_process';
  apiMetrics: ApiMetrics;
  metricsPublic: boolean;
  requestStartTimes: WeakMap<FastifyRequest, number>;
};

export function createApiContext(
  orchestrator: BossRaidOrchestrator,
  env: NodeJS.ProcessEnv = process.env
): ApiContext {
  const adminToken = env.BOSSRAID_ADMIN_TOKEN;
  const demoRouteEnabled = readBooleanEnv(env.BOSSRAID_DEMO_ROUTE_ENABLED);
  const demoToken = env.BOSSRAID_DEMO_TOKEN?.trim() || undefined;
  const apiBodyLimitBytes = readPositiveInteger(
    env.BOSSRAID_API_BODY_LIMIT_BYTES,
    DEFAULTS.API_BODY_LIMIT_BYTES
  );
  const providerSubmissionBodyLimitBytes = Math.max(
    apiBodyLimitBytes,
    DEFAULTS.PROVIDER_SUBMISSION_BODY_LIMIT_MULTIPLIER * 1024 * 1024
  );
  const opsSessionTtlSec = readPositiveInteger(
    env.BOSSRAID_OPS_SESSION_TTL_SEC,
    DEFAULTS.OPS_SESSION_TTL_SEC
  );
  const publicSessionTtlSec = readPositiveInteger(
    env.BOSSRAID_PUBLIC_SESSION_TTL_SEC,
    DEFAULT_PUBLIC_SESSION_TTL_SEC
  );
  const publicAuthNonceTtlSec = readPositiveInteger(env.BOSSRAID_PUBLIC_AUTH_NONCE_TTL_SEC, 300);
  const buyerKeyDefaultSpendLimitUsd = readPositiveNumber(
    env.BOSSRAID_BUYER_KEY_DEFAULT_SPEND_LIMIT_USD
  );
  const buyerMaxRequestBudgetUsd = readPositiveNumber(env.BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD);
  const buyerKeyRateLimitMax = readPositiveInteger(
    env.BOSSRAID_BUYER_KEY_RATE_LIMIT_MAX,
    DEFAULTS.PUBLIC_RATE_LIMIT_MAX
  );
  const buyerKeyRateLimitWindowMs = readPositiveInteger(
    env.BOSSRAID_BUYER_KEY_RATE_LIMIT_WINDOW_MS,
    DEFAULTS.PUBLIC_RATE_LIMIT_WINDOW_MS
  );
  const publicRateLimitMax = readPositiveInteger(
    env.BOSSRAID_PUBLIC_RATE_LIMIT_MAX,
    DEFAULTS.PUBLIC_RATE_LIMIT_MAX
  );
  const publicRateLimitWindowMs = readPositiveInteger(
    env.BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS,
    DEFAULTS.PUBLIC_RATE_LIMIT_WINDOW_MS
  );
  const opsSessionRateLimitMax = readPositiveInteger(
    env.BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX,
    DEFAULTS.OPS_SESSION_RATE_LIMIT_MAX
  );
  const opsSessionRateLimitWindowMs = readPositiveInteger(
    env.BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS,
    DEFAULTS.OPS_SESSION_RATE_LIMIT_WINDOW_MS
  );
  const providerHealthTimeoutMs = readPositiveInteger(
    env.BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS,
    DEFAULTS.PROVIDER_HEALTH_TIMEOUT_MS
  );
  const chatDefaultMaxTotalCost = readPositiveNumber(env.BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST);
  const chatTerminalSettleGraceMs = resolveChatTerminalSettleGraceMs(env);
  const evaluatorMaxConcurrentJobs = readPositiveInteger(env.BOSSRAID_EVAL_MAX_CONCURRENT_JOBS, 2);
  const registryToken = env.BOSSRAID_REGISTRY_TOKEN;
  const mercenaryIdentity = readMercenaryErc8004Identity(env);
  const trustProxy =
    env.BOSSRAID_TRUST_PROXY === '1' ||
    env.BOSSRAID_TRUST_PROXY === 'true' ||
    env.BOSSRAID_TRUST_PROXY === 'yes';
  const teeSigner = readTeeSigner(env);
  const app = Fastify({
    logger: false,
    bodyLimit: apiBodyLimitBytes,
    trustProxy,
  });
  const erc8004Verifier = createErc8004Verifier(env);
  const settlementProofRefresher = createSettlementProofRefresher(env);
  const controlState = createApiControlState(env);
  const workerIsolation =
    env.BOSSRAID_EVAL_JOB_ISOLATION === 'container' ? 'per_job_container' : 'per_job_process';
  const apiMetrics = createApiMetrics();
  const metricsPublic = readBooleanEnv(env.BOSSRAID_METRICS_PUBLIC);
  const requestStartTimes = new WeakMap<FastifyRequest, number>();

  return {
    orchestrator,
    env,
    app,
    adminToken,
    demoRouteEnabled,
    demoToken,
    apiBodyLimitBytes,
    providerSubmissionBodyLimitBytes,
    opsSessionTtlSec,
    publicSessionTtlSec,
    publicAuthNonceTtlSec,
    buyerKeyDefaultSpendLimitUsd,
    buyerMaxRequestBudgetUsd,
    buyerKeyRateLimitMax,
    buyerKeyRateLimitWindowMs,
    publicRateLimitMax,
    publicRateLimitWindowMs,
    opsSessionRateLimitMax,
    opsSessionRateLimitWindowMs,
    providerHealthTimeoutMs,
    chatDefaultMaxTotalCost,
    chatTerminalSettleGraceMs,
    evaluatorMaxConcurrentJobs,
    registryToken,
    mercenaryIdentity,
    trustProxy,
    teeSigner,
    erc8004Verifier,
    settlementProofRefresher,
    controlState,
    workerIsolation,
    apiMetrics,
    metricsPublic,
    requestStartTimes,
  };
}
