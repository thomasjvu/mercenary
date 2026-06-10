import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { recoverMessageAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
  ApiContractError,
  buildBossRaidRequestFromChatCompletion,
  parseAgentHeartbeatInput,
  parseChatCompletionRequest,
  parseBossRaidRequest,
  parseBossRaidSpawnInput,
  parseProviderDiscoveryQuery,
  parseProviderFailure,
  parseProviderHeartbeat,
  parseProviderRegistrationInput,
  parseProviderSubmission,
} from '@bossraid/api-contracts';
import {
  type BossRaidOrchestrator,
  createDefaultOrchestrator,
  InvalidRaidLaunchReservationError,
  NoEligibleProvidersError,
  PersistenceUnavailableError,
  runtimeOptionsFromEnv,
  UnknownRaidError,
} from '@bossraid/orchestrator';
import { probeProviderHealth, verifyProviderAuth } from '@bossraid/provider-sdk';
import { getConfig } from '@bossraid/validator';
import logger from '@bossraid/logger';
import {
  type ChatCompletionRequest,
  type BossRaidResultOutput,
  type BossRaidStatusOutput,
  type BossRaidSpawnInput,
  type Erc8004Identity,
  type ProviderHealthStatus,
  type ProviderPricing,
  type ProviderProfile,
  type RaidQuoteSnapshot,
  type ProviderRegistrationInput,
  type SanitizedTaskSpec,
  type TaskFile,
  asSingleHeader,
  readBooleanEnv as readBooleanEnvUtil,
} from '@bossraid/shared-types';
import {
  cleanupWorkspace,
  materializeWorkspace,
  runRuntimeProbes,
  runtimeExecutionEnabled,
  runtimeExecutionTransport,
  unsafeHostExecutionAllowed,
} from '@bossraid/sandbox-runner';
import {
  applyX402Headers,
  buildX402PaymentRequired,
  isX402ProtocolError,
  readX402Config,
  readX402ReservationId,
  requireX402Payment,
} from './x402.js';
import { buildAgentLog, buildAgentManifest } from './agent-artifacts.js';
import { createErc8004Verifier } from './erc8004.js';
import {
  createSettlementProofRefresher,
  persistSettlementExecutionArtifact,
  settlementExecutionChanged,
} from './settlement-proof.js';
import { createApiControlState, type ApiControlState } from './control-state.js';
import { computeSavingsUsd, estimateBenchmarkPriceUsd } from './marketplace-benchmark.js';
import { DEFAULTS, TIMEOUTS } from '@bossraid/constants';

interface AttestedRuntimePayload {
  version: 1;
  nonce: string;
  timestamp: string;
  deploymentTarget: string | null;
  teePlatform: string | null;
  storageBackend: string;
  providers: number;
  readyProviders: number;
  raids: number;
  evaluatorTransport: string;
  workerIsolation: 'per_job_process' | 'per_job_container';
}

interface AttestedRaidResultPayload {
  version: 1;
  nonce: string;
  timestamp: string;
  deploymentTarget: string | null;
  teePlatform: string | null;
  evaluatorTransport: string;
  workerIsolation: 'per_job_process' | 'per_job_container';
  raidId: string;
  status: BossRaidResultOutput['status'];
  approvedSubmissionCount: number;
  resultHash: `0x${string}`;
  result: BossRaidResultOutput;
}

export function buildApiServer(
  orchestrator: BossRaidOrchestrator,
  env: NodeJS.ProcessEnv = process.env
) {
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
    7 * 24 * 60 * 60
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
  let mercenaryIdentity = readMercenaryErc8004Identity(env);
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

  app.addHook('onRequest', (request, _reply, done) => {
    requestStartTimes.set(request, Date.now());
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const startedAt = requestStartTimes.get(request);
    requestStartTimes.delete(request);
    apiMetrics.recordHttp({
      method: request.method,
      route: request.routeOptions.url ?? request.url.split('?')[0] ?? 'unknown',
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Date.now() - (startedAt ?? Date.now())),
    });
    done();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isX402ProtocolError(error)) {
      apiMetrics.increment('x402.payment_required');
      const reservationId = error.paymentRequired.accepts[0]?.extra?.reservationId;
      if (typeof reservationId === 'string') {
        reply.header('X-BOSSRAID-LAUNCH-RESERVATION', reservationId);
      }
      applyX402Headers(reply, {
        paymentRequired: error.paymentRequired,
        settlement: error.settlement,
      });
      reply.code(error.statusCode).send({
        error: 'payment_required',
        message: error.message,
        x402: error.paymentRequired,
        settlement: error.settlement,
      });
      return;
    }

    if (error instanceof ApiContractError) {
      apiMetrics.increment('requests.bad_request');
      reply.code(error.statusCode).send({
        error: 'bad_request',
        message: error.message,
      });
      return;
    }

    if (error instanceof NoEligibleProvidersError) {
      apiMetrics.increment('routing.no_eligible_providers');
      reply.code(409).send({
        error: 'no_eligible_providers',
        message: error.message,
      });
      return;
    }

    if (error instanceof UnknownRaidError) {
      reply.code(404).send({
        error: 'not_found',
        message: error.message,
      });
      return;
    }

    if (error instanceof InvalidRaidLaunchReservationError) {
      reply.code(409).send({
        error: 'invalid_launch_reservation',
        message: error.message,
      });
      return;
    }

    if (error instanceof PersistenceUnavailableError) {
      apiMetrics.increment('persistence.unavailable');
      reply.code(503).send({
        error: 'persistence_unavailable',
        message: error.message,
      });
      return;
    }

    apiMetrics.increment('requests.internal_error');
    logger.error(error);
    reply.code(500).send({
      error: 'internal_error',
      message: 'Internal server error.',
    });
  });

  function providerIsAuthorized(
    providerId: string,
    request: {
      method: string;
      path: string;
      body: unknown;
      bodyText?: string;
      headers: Record<string, string | string[] | undefined>;
    }
  ): boolean {
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      return false;
    }

    return verifyProviderAuth({
      auth: provider.auth,
      providerId,
      method: request.method,
      path: request.path,
      body: request.bodyText ?? JSON.stringify(request.body ?? {}),
      headers: request.headers,
      authorizationHeader: asSingleHeader(request.headers.authorization),
      timestampHeader: asSingleHeader(request.headers['x-bossraid-timestamp']),
      signatureHeader: asSingleHeader(request.headers['x-bossraid-signature']),
      providerIdHeader: asSingleHeader(request.headers['x-bossraid-provider-id']),
    });
  }

  function registryIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (!registryToken) {
      return false;
    }

    return asSingleHeader(headers.authorization) === `Bearer ${registryToken}`;
  }

  function adminIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (
      adminToken &&
      safeEqualString(asSingleHeader(headers.authorization), `Bearer ${adminToken}`)
    ) {
      return true;
    }

    const session = readOpsSession(headers);
    return session != null;
  }

  function readPublicAuth(headers: Record<string, string | string[] | undefined>):
    | { type: 'session'; wallet: string; token: string }
    | {
        type: 'api_key';
        wallet: string;
        apiKeyId: string;
        spendLimitUsd?: number;
        spentUsd: number;
      }
    | undefined {
    const apiKey = readBuyerApiKey(headers);
    if (apiKey) {
      return {
        type: 'api_key',
        wallet: apiKey.wallet,
        apiKeyId: apiKey.id,
        spendLimitUsd: apiKey.spendLimitUsd,
        spentUsd: apiKey.spentUsd,
      };
    }

    const session = readPublicSession(headers);
    return session
      ? {
          type: 'session',
          wallet: session.wallet,
          token: session.token,
        }
      : undefined;
  }

  function requirePublicSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): { wallet: string; token: string } | { error: 'unauthorized' } {
    const session = readPublicSession(headers);
    if (!session) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    return {
      wallet: session.wallet,
      token: session.token,
    };
  }

  function readBuyerApiKey(headers: Record<string, string | string[] | undefined>) {
    const authorization = asSingleHeader(headers.authorization);
    if (!authorization?.startsWith('Bearer br_')) {
      return undefined;
    }
    return controlState.readActiveBuyerApiKeyByHash(hashBuyerApiKey(authorization.slice(7)));
  }

  function requireAdmin(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): { error: string; message?: string } | undefined {
    if (!adminToken) {
      reply.code(503);
      return {
        error: 'admin_auth_not_configured',
        message: 'BOSSRAID_ADMIN_TOKEN is required for this route.',
      };
    }

    if (!adminIsAuthorized(headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    return undefined;
  }

  function demoRouteIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (adminIsAuthorized(headers)) {
      return true;
    }

    if (!demoToken) {
      return true;
    }

    return safeEqualString(asSingleHeader(headers['x-bossraid-demo-token']), demoToken);
  }

  function requireDemoRouteAccess(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): { error: string; message?: string } | undefined {
    if (!demoRouteEnabled) {
      reply.code(404);
      return {
        error: 'not_found',
        message: 'Demo raid route is not enabled.',
      };
    }

    if (!demoRouteIsAuthorized(headers)) {
      reply.code(401);
      return {
        error: 'unauthorized',
        message: 'Demo raid route requires a valid x-bossraid-demo-token header.',
      };
    }

    return undefined;
  }

  function consumeRateLimit(
    bucket: string,
    key: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: true } | { allowed: false; retryAfterSec: number } {
    return controlState.consumeRateLimit(bucket, key, maxRequests, windowMs);
  }

  function requireRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
    bucket: string,
    maxRequests: number,
    windowMs: number
  ): { error: string; message: string } | undefined {
    if (maxRequests <= 0) {
      return undefined;
    }

    const result = consumeRateLimit(bucket, readClientRateLimitKey(request), maxRequests, windowMs);
    if (result.allowed) {
      return undefined;
    }

    reply.code(429).header('retry-after', String(result.retryAfterSec));
    return {
      error: 'rate_limited',
      message: 'Too many requests. Retry later.',
    };
  }

  function requireBuyerApiKeyRateLimit(
    auth:
      | {
          type: 'api_key';
          wallet: string;
          apiKeyId: string;
          spendLimitUsd?: number;
          spentUsd: number;
        }
      | { type: 'session'; wallet: string; token: string }
      | undefined,
    reply: FastifyReply
  ): { error: string; message: string } | undefined {
    if (auth?.type !== 'api_key' || buyerKeyRateLimitMax <= 0) {
      return undefined;
    }

    const result = consumeRateLimit(
      'buyer-api-key',
      auth.apiKeyId,
      buyerKeyRateLimitMax,
      buyerKeyRateLimitWindowMs
    );
    if (result.allowed) {
      return undefined;
    }

    reply.code(429).header('retry-after', String(result.retryAfterSec));
    return {
      error: 'rate_limited',
      message: 'API key rate limit exceeded. Retry later.',
    };
  }

  function requireRaidReadAccess(
    reply: FastifyReply,
    raidId: string,
    headers: Record<string, string | string[] | undefined>,
    queryAccessToken?: string
  ): { error: string } | undefined {
    if (adminIsAuthorized(headers)) {
      return undefined;
    }

    const raid = orchestrator.getRaid(raidId);
    const raidAccessToken = asSingleHeader(headers[RAID_ACCESS_TOKEN_HEADER]) ?? queryAccessToken;
    const expectedHash = raid?.raidAccessTokenHash;
    if (
      !raidAccessToken ||
      !expectedHash ||
      !safeEqualString(hashRaidAccessToken(raidAccessToken), expectedHash)
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    return undefined;
  }

  function readRaidAccessTokenQuery(query: unknown): string | undefined {
    const params = query as
      | {
          token?: unknown;
          raidAccessToken?: unknown;
          raid_access_token?: unknown;
        }
      | undefined;
    return (
      asSingleQueryValue(params?.token) ??
      asSingleQueryValue(params?.raidAccessToken) ??
      asSingleQueryValue(params?.raid_access_token)
    );
  }

  function serializeProviderProfile(
    provider: ProviderProfile,
    options: { includeEndpoint?: boolean } = {}
  ) {
    return {
      providerId: provider.providerId,
      agentId: provider.agentId,
      displayName: provider.displayName,
      description: provider.description,
      endpointType: provider.endpointType,
      endpoint: options.includeEndpoint ? provider.endpoint : undefined,
      specializations: provider.specializations,
      supportedLanguages: provider.supportedLanguages,
      supportedFrameworks: provider.supportedFrameworks,
      pricing: provider.pricing,
      pricePerTaskUsd: provider.pricePerTaskUsd,
      maxConcurrency: provider.maxConcurrency,
      status: provider.status,
      modelFamily: provider.modelFamily,
      agentFramework: provider.agentFramework,
      modelProvider: provider.modelProvider,
      modelId: provider.modelId,
      outputTypes: provider.outputTypes,
      verification: provider.verification,
      privacy: provider.privacy,
      erc8004: provider.erc8004,
      trust: provider.trust,
      reputation: provider.reputation,
      scores: provider.scores,
      lastSeenAt: provider.lastSeenAt,
      source: provider.source,
    };
  }

  function requireProviderOrRaidReadAccess(
    reply: FastifyReply,
    raidId: string,
    providerId: string,
    request: {
      method: string;
      path: string;
      body: unknown;
      bodyText?: string;
      headers: Record<string, string | string[] | undefined>;
    }
  ): { error: string; message?: string } | undefined {
    if (adminIsAuthorized(request.headers)) {
      return undefined;
    }
    if (
      providerIsAuthorized(providerId, {
        method: request.method,
        path: request.path,
        body: request.body,
        bodyText: request.bodyText,
        headers: request.headers,
      })
    ) {
      return undefined;
    }

    const raid = orchestrator.getRaid(raidId);
    const token = asSingleHeader(request.headers[RAID_ACCESS_TOKEN_HEADER]);
    if (
      token &&
      raid?.raidAccessTokenHash &&
      safeEqualString(hashRaidAccessToken(token), raid.raidAccessTokenHash)
    ) {
      return undefined;
    }

    reply.code(401);
    return { error: 'unauthorized' };
  }

  async function buildProviderSettlementPayload(
    raidId: string,
    providerId: string
  ): Promise<Record<string, unknown> | undefined> {
    const raid = orchestrator.getRaid(raidId);
    if (!raid || !raid.selectedProviders.includes(providerId)) {
      return undefined;
    }
    await ensureSettlementProofState(raidId);
    const result = orchestrator.getResult(raidId);
    const ranked = result.rankedSubmissions?.find(
      (entry) => entry.submission.providerId === providerId
    );
    const grossUsd =
      ranked?.breakdown.valid && result.settlement
        ? result.settlement.payoutPerSuccessfulProvider
        : 0;
    return {
      raidId,
      providerId,
      status: raid.status,
      grossUsd,
      feesUsd: 0,
      netUsd: grossUsd,
      receiptPath: `/receipt?raidId=${raidId}`,
      settlement: result.settlement,
      settlementExecution: result.settlementExecution,
      assignment: raid.assignments[providerId],
      valid: ranked?.breakdown.valid ?? false,
    };
  }

  async function ensureErc8004ProofState(
    options: {
      includeMercenary?: boolean;
      providers?: ProviderProfile[];
    } = {}
  ): Promise<void> {
    if (!erc8004Verifier.enabled) {
      return;
    }

    const providers = options.providers ?? orchestrator.listProviders();
    await erc8004Verifier.verifyProviders(providers);
    if (options.includeMercenary !== false) {
      mercenaryIdentity = await erc8004Verifier.verifyIdentity(mercenaryIdentity);
    }
  }

  async function ensureSettlementProofState(raidId: string): Promise<void> {
    const raid = orchestrator.getRaid(raidId);
    if (!raid?.settlementExecution) {
      return;
    }

    const refreshed = await settlementProofRefresher.refresh(raid.settlementExecution);
    if (!refreshed || !settlementExecutionChanged(raid.settlementExecution, refreshed)) {
      return;
    }

    await orchestrator.updateSettlementExecution(raidId, refreshed);
    try {
      await persistSettlementExecutionArtifact(refreshed);
    } catch (error) {
      logger.error(error, 'Mercenary settlement artifact sync error');
    }
  }

  function serializeProviderHealth(
    health: ProviderHealthStatus,
    options: { includeDiagnostics?: boolean; includeEndpoint?: boolean } = {}
  ) {
    return {
      providerId: health.providerId,
      providerName: health.providerName,
      endpoint: options.includeEndpoint ? health.endpoint : undefined,
      reachable: health.reachable,
      ready: health.ready,
      statusCode: health.statusCode,
      model: health.model,
      missing: options.includeDiagnostics ? health.missing : undefined,
      modelApiBase: options.includeDiagnostics ? health.modelApiBase : undefined,
      error: options.includeDiagnostics ? health.error : undefined,
    };
  }

  function buildInferenceMarketSnapshot(
    options: {
      modelId?: string;
      modelProvider?: string;
      agentFramework?: string;
      maxBudgetUsd?: number;
      privacyMode?: string;
      verificationStatus?: string;
    } = {}
  ) {
    const providers = orchestrator.listProviders().filter((provider) => {
      if (options.modelId && provider.modelId !== options.modelId) {
        return false;
      }
      if (options.modelProvider && provider.modelProvider !== options.modelProvider) {
        return false;
      }
      if (options.agentFramework && provider.agentFramework !== options.agentFramework) {
        return false;
      }
      if (
        typeof options.maxBudgetUsd === 'number' &&
        readProviderMarketRateUsd(provider) > options.maxBudgetUsd
      ) {
        return false;
      }
      if (
        options.verificationStatus &&
        (provider.verification?.status ?? 'pending') !== options.verificationStatus
      ) {
        return false;
      }
      if (options.privacyMode === 'strict' && !providerHasStrictPrivateMarketMetadata(provider)) {
        return false;
      }
      if ((provider.marketplaceOfferStatus ?? 'active') === 'paused') {
        return false;
      }
      return Boolean(resolveProviderMarketModelId(provider));
    });

    return buildInferenceMarkets(providers);
  }

  async function handleChatCompletionRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    options: {
      discountInference?: boolean;
    } = {}
  ) {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      'public-action',
      publicRateLimitMax,
      publicRateLimitWindowMs
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const parsedChatRequest = parseChatCompletionRequest(request.body);
    const strictAlkahestLane = readTrustedAlkahestClient(request.headers) != null;
    const discountDefaultMaxTotalCost = options.discountInference
      ? resolveDiscountInferenceDefaultMaxTotalCost(parsedChatRequest, orchestrator.listProviders())
      : undefined;
    const chatRequest = options.discountInference
      ? forceDiscountInferenceChatPolicy(parsedChatRequest, {
          defaultMaxTotalCost: discountDefaultMaxTotalCost,
          strictAlkahestLane,
        })
      : parsedChatRequest;
    const raidRequest =
      chatRequest.raidRequest ??
      parseBossRaidRequest(
        buildBossRaidRequestFromChatCompletion(chatRequest, {
          defaultMaxTotalCost: discountDefaultMaxTotalCost ?? chatDefaultMaxTotalCost,
        })
      );
    const publicAuth = readPublicAuth(request.headers);
    const apiKeyRateLimitError = requireBuyerApiKeyRateLimit(publicAuth, reply);
    if (apiKeyRateLimitError) {
      return apiKeyRateLimitError;
    }
    const budgetError = enforceBuyerBudget(
      controlState,
      publicAuth,
      raidRequest.constraints.maxBudgetUsd,
      buyerMaxRequestBudgetUsd
    );
    if (budgetError) {
      reply.code(budgetError.statusCode);
      return {
        error: budgetError.error,
        message: budgetError.message,
      };
    }
    const created = Math.floor(Date.now() / 1000);
    const directResponse = options.discountInference
      ? null
      : buildDirectChatCompletionResponse(chatRequest, created);

    if (directResponse) {
      if (chatRequest.stream) {
        await streamDirectChatCompletionResponse(reply, directResponse);
        return;
      }

      return directResponse;
    }

    await ensureErc8004ProofState({ includeMercenary: false });
    const payment = await requireReservedLaunchPayment('chat', request, raidRequest);
    let spawn;
    try {
      spawn =
        payment.reservationId && payment.requestKey
          ? await orchestrator.spawnReservedRaid(
              payment.reservationId,
              payment.requestKey,
              payment.escrowFundingUsd,
              payment.platformMarkupUsd
            )
          : await orchestrator.spawnRaid(
              raidRequest,
              payment.escrowFundingUsd,
              payment.platformMarkupUsd
            );
    } catch (error) {
      await refundManaBilling({ manaBilling: payment.manaBilling, reason: 'spawn_failed' });
      throw error;
    }

    if (chatRequest.stream) {
      if (publicAuth?.type === 'api_key') {
        controlState.recordBuyerApiKeyUsage(
          publicAuth.apiKeyId,
          payment.escrowFundingUsd ?? raidRequest.constraints.maxBudgetUsd
        );
      }
      applyX402Headers(reply, {
        settlement: payment.settlement,
      });
      await streamChatCompletionResponse(reply, orchestrator, {
        chatRequest,
        raidRequest,
        spawn,
        created,
        settleGraceMs: chatTerminalSettleGraceMs,
        bossraidBilling: payment.manaBilling
          ? {
              capture: async (usage, selectedSeller) => {
                const settlement = await captureManaBilling({
                  manaBilling: payment.manaBilling,
                  usage,
                  raidId: spawn.raidId,
                  receiptPath: spawn.receiptPath,
                });
                return buildBossRaidBillingMetadata({
                  manaBilling: payment.manaBilling,
                  settlement,
                  selectedSeller,
                  receiptPath: spawn.receiptPath,
                });
              },
            }
          : undefined,
      });
      return;
    }

    let outcome;
    try {
      outcome = await waitForTerminalRaidOutput(
        orchestrator,
        spawn.raidId,
        Math.max(raidRequest.constraints.maxLatencySec * 1000, TIMEOUTS.MIN_TIMEOUT_MS),
        chatTerminalSettleGraceMs
      );
    } catch (error) {
      await refundManaBilling({
        manaBilling: payment.manaBilling,
        reason: 'terminal_output_failed',
        raidId: spawn.raidId,
      });
      throw error;
    }
    const response = buildChatCompletionResponse(
      chatRequest,
      spawn,
      outcome,
      created
    ) as ReturnType<typeof buildChatCompletionResponse> & { bossraid?: unknown };
    const manaSettlement = await captureManaBilling({
      manaBilling: payment.manaBilling,
      usage: response.usage,
      raidId: spawn.raidId,
      receiptPath: spawn.receiptPath,
    });
    const selectedSeller =
      outcome.result.synthesizedOutput?.baseSubmissionProviderId ??
      outcome.result.approvedSubmissions?.[0]?.submission.providerId;
    const capturedCostUsd =
      payment.escrowFundingUsd ??
      outcome.result.settlement?.successfulProvidersPaid ??
      raidRequest.constraints.maxBudgetUsd;
    const bossraid = buildBossRaidBillingMetadata({
      manaBilling: payment.manaBilling,
      settlement: manaSettlement,
      selectedSeller,
      receiptPath: spawn.receiptPath,
      modelId: chatRequest.model,
      paidPriceUsd: capturedCostUsd,
    });
    if (bossraid) {
      response.bossraid = bossraid;
    }
    captureApiKeyBilling({
      apiKeyBilling: payment.apiKeyBilling,
      actualCostUsd: capturedCostUsd,
      route: options.discountInference ? 'inference' : 'chat',
      raidId: spawn.raidId,
      modelId: chatRequest.model,
      sellerId: selectedSeller,
    });
    if (!payment.apiKeyBilling && publicAuth?.type === 'api_key') {
      controlState.recordBuyerApiKeyUsage(publicAuth.apiKeyId, capturedCostUsd);
    }
    recordMarketplaceLedgersFromRaid({
      raidId: spawn.raidId,
      route: options.discountInference ? 'inference' : 'chat',
      buyerWallet: publicAuth?.wallet,
      apiKeyId: publicAuth?.type === 'api_key' ? publicAuth.apiKeyId : undefined,
      modelId: chatRequest.model,
      costUsd: capturedCostUsd,
      skipBuyerPurchase: Boolean(payment.apiKeyBilling),
    });
    applyX402Headers(reply, {
      settlement: payment.settlement,
    });
    return response;
  }

  function readOpsSession(
    headers: Record<string, string | string[] | undefined>
  ): { token: string; expiresAt: number } | undefined {
    const cookieHeader = asSingleHeader(headers.cookie);
    if (!cookieHeader) {
      return undefined;
    }

    const token = parseCookieHeader(cookieHeader)[OPS_SESSION_COOKIE_NAME];
    return controlState.readOpsSession(token);
  }

  function readPublicSession(
    headers: Record<string, string | string[] | undefined>
  ): { token: string; wallet: string; expiresAt: number } | undefined {
    const cookieHeader = asSingleHeader(headers.cookie);
    if (!cookieHeader) {
      return undefined;
    }

    const token = parseCookieHeader(cookieHeader)[PUBLIC_SESSION_COOKIE_NAME];
    return controlState.readPublicSession(token);
  }

  function issueOpsSession(reply: FastifyReply): { expiresAt: number } {
    const session = controlState.issueOpsSession(opsSessionTtlSec);
    reply.header(
      'set-cookie',
      serializeCookie(OPS_SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/ops-api',
        maxAge: opsSessionTtlSec,
        secure: env.NODE_ENV === 'production',
      })
    );
    return { expiresAt: session.expiresAt };
  }

  function clearOpsSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): void {
    const session = readOpsSession(headers);
    if (session) {
      controlState.clearOpsSession(session.token);
    }
    reply.header(
      'set-cookie',
      serializeCookie(OPS_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/ops-api',
        maxAge: 0,
        secure: env.NODE_ENV === 'production',
      })
    );
  }

  function issuePublicSessionCookie(reply: FastifyReply, wallet: string): { expiresAt: number } {
    const session = controlState.issuePublicSession(wallet, publicSessionTtlSec);
    reply.header(
      'set-cookie',
      serializeCookie(PUBLIC_SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: publicSessionTtlSec,
        secure: env.NODE_ENV === 'production',
      })
    );
    return { expiresAt: session.expiresAt };
  }

  function clearPublicSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): void {
    const session = readPublicSession(headers);
    if (session) {
      controlState.clearPublicSession(session.token);
    }
    reply.header(
      'set-cookie',
      serializeCookie(PUBLIC_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: 0,
        secure: env.NODE_ENV === 'production',
      })
    );
  }

  function validateProviderCallback(
    raidId: string,
    providerId: string,
    providerRunId?: string
  ): { ok: true } | { ok: false; statusCode: number; body: { error: string; message: string } } {
    const raid = orchestrator.getRaid(raidId);
    if (!raid) {
      return {
        ok: false,
        statusCode: 404,
        body: {
          error: 'not_found',
          message: `Unknown raid: ${raidId}`,
        },
      };
    }

    const assignment = raid.assignments[providerId];
    if (!assignment) {
      return {
        ok: false,
        statusCode: 404,
        body: {
          error: 'provider_not_assigned',
          message: `Provider ${providerId} is not assigned to raid ${raidId}.`,
        },
      };
    }

    if (!assignment.providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: 'provider_run_not_ready',
          message: `Provider ${providerId} has not accepted raid ${raidId} yet.`,
        },
      };
    }

    if (!providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: 'provider_run_required',
          message: `Provider ${providerId} must include providerRunId for raid ${raidId}.`,
        },
      };
    }

    if (assignment.providerRunId !== providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: 'provider_run_mismatch',
          message: `Provider run ${providerRunId} does not match the active assignment for raid ${raidId}.`,
        },
      };
    }

    return { ok: true };
  }

  function getRaidId(request: { params: unknown }): string {
    return (request.params as { raidId: string }).raidId;
  }

  function getLaunchReservationPaymentTimeoutSeconds(reservation: {
    createdAt: string;
    expiresAt: string;
    paymentTimeoutSeconds?: number;
  }): number {
    if (
      typeof reservation.paymentTimeoutSeconds === 'number' &&
      Number.isFinite(reservation.paymentTimeoutSeconds)
    ) {
      return Math.max(1, Math.round(reservation.paymentTimeoutSeconds));
    }

    const derivedTimeoutSeconds = Math.ceil(
      (Date.parse(reservation.expiresAt) - Date.parse(reservation.createdAt)) / 1000
    );
    return Math.max(1, Number.isFinite(derivedTimeoutSeconds) ? derivedTimeoutSeconds : 1);
  }

  interface ManaBillingContext {
    manaAccountId: string;
    sourceAppId: 'alkahest';
    reservationId: string;
    reservedMana: number;
    quoteSnapshot?: RaidQuoteSnapshot;
  }

  interface ApiKeyBillingContext {
    apiKeyId: string;
    wallet: string;
    reservedUsd: number;
    useBalance: boolean;
  }

  function readManaBillingHeaders(
    headers: Record<string, string | string[] | undefined>
  ): { manaAccountId: string; sourceAppId: 'alkahest' } | undefined {
    const trustedClient = readTrustedAlkahestClient(headers);
    const manaAccountId = asSingleHeader(headers['x-bossraid-mana-account-id']);
    if (!trustedClient && !manaAccountId) {
      return undefined;
    }
    if (!trustedClient || !manaAccountId) {
      throw new ApiContractError('Trusted Alkahest mana billing headers are incomplete.', 401);
    }
    const trustedKey = env.BOSSRAID_API_KEY || env.BOSSRAID_TRUSTED_CLIENT_KEY;
    if (!trustedKey) {
      throw new ApiContractError('BOSSRAID_API_KEY is required for trusted mana billing.', 503);
    }
    if (!safeEqualString(asSingleHeader(headers.authorization), `Bearer ${trustedKey}`)) {
      throw new ApiContractError('Invalid trusted Boss Raid client credential.', 401);
    }
    return { manaAccountId, sourceAppId: 'alkahest' };
  }

  function buildManaCoreUrl(path: string): string {
    const rawBase = env.BOSSRAID_MANA_CORE_URL?.trim();
    if (!rawBase) {
      throw new ApiContractError('BOSSRAID_MANA_CORE_URL is required for mana billing.', 503);
    }
    const base = rawBase.replace(/\/$/, '');
    if (base.endsWith('/v1/mana')) {
      return `${base}${path}`;
    }
    if (base.endsWith('/v1')) {
      return `${base}/mana${path}`;
    }
    return `${base}/v1/mana${path}`;
  }

  async function callManaCore(path: string, body: Record<string, unknown>) {
    const key = env.BOSSRAID_MANA_CORE_KEY?.trim();
    if (!key) {
      throw new ApiContractError('BOSSRAID_MANA_CORE_KEY is required for mana billing.', 503);
    }
    const response = await fetch(buildManaCoreUrl(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mana-core-key': key,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : 'Mana Core request failed.';
      throw new ApiContractError(message, response.status);
    }
    return payload;
  }

  async function reserveManaBilling(input: {
    route: 'raid' | 'chat';
    manaAccountId: string;
    amount: number;
    requestKey: string;
    quoteSnapshot?: RaidQuoteSnapshot;
  }): Promise<ManaBillingContext> {
    const payload = await callManaCore('/reservations', {
      manaAccountId: input.manaAccountId,
      appId: env.BOSSRAID_MANA_CORE_APP_ID || 'bossraid',
      action: input.route,
      amount: input.amount,
      idempotencyKey: `bossraid:${input.route}:${input.requestKey}`,
      metadata: {
        sourceAppId: 'alkahest',
        quoteId: input.quoteSnapshot?.quoteId,
        maxChargeMana: input.quoteSnapshot?.manaQuote.maxChargeMana,
        maxChargeUsd: input.quoteSnapshot?.maxChargeUsd,
      },
    });
    const reservation = payload.reservation as { id?: unknown; amount?: unknown } | undefined;
    const reservationId = typeof reservation?.id === 'string' ? reservation.id : undefined;
    if (!reservationId) {
      throw new ApiContractError('Mana Core reservation response did not include an id.', 502);
    }
    return {
      manaAccountId: input.manaAccountId,
      sourceAppId: 'alkahest',
      reservationId,
      reservedMana: input.amount,
      quoteSnapshot: input.quoteSnapshot,
    };
  }

  function calculateManaCaptureAmount(
    manaBilling: ManaBillingContext,
    usage: { prompt_tokens?: number; completion_tokens?: number }
  ): number {
    const quote = manaBilling.quoteSnapshot;
    const primary = quote?.providers.find((provider) => provider.phase === 'primary');
    if (!quote || !primary) {
      return manaBilling.reservedMana;
    }
    const pricing = primary.rateCard;
    const promptTokens = Math.max(0, usage.prompt_tokens ?? 0);
    const completionTokens = Math.max(0, usage.completion_tokens ?? 0);
    const chargeUsd =
      pricing.mode === 'token_metered'
        ? Math.max(
            (promptTokens / 1_000_000) * (pricing.pricePer1mInputTokensUsd ?? 0) +
              (completionTokens / 1_000_000) * (pricing.pricePer1mOutputTokensUsd ?? 0),
            pricing.minimumChargeUsd ?? 0
          )
        : (pricing.pricePerTaskUsd ?? quote.maxChargeUsd);
    return Math.max(
      1,
      Math.min(manaBilling.reservedMana, Math.ceil(chargeUsd * quote.manaQuote.manaPerUsd))
    );
  }

  async function captureManaBilling(input: {
    manaBilling?: ManaBillingContext;
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    raidId: string;
    receiptPath: string;
  }): Promise<{ capturedMana?: number; refundedMana?: number } | undefined> {
    if (!input.manaBilling) {
      return undefined;
    }
    const capturedMana = calculateManaCaptureAmount(input.manaBilling, input.usage);
    await callManaCore(
      `/reservations/${encodeURIComponent(input.manaBilling.reservationId)}/capture`,
      {
        manaAccountId: input.manaBilling.manaAccountId,
        amount: capturedMana,
        metadata: {
          sourceAppId: input.manaBilling.sourceAppId,
          raidId: input.raidId,
          receiptPath: input.receiptPath,
          quoteId: input.manaBilling.quoteSnapshot?.quoteId,
          usage: input.usage,
        },
      }
    );
    return {
      capturedMana,
      refundedMana: Math.max(0, input.manaBilling.reservedMana - capturedMana),
    };
  }

  async function refundManaBilling(input: {
    manaBilling?: ManaBillingContext;
    reason: string;
    raidId?: string;
  }): Promise<void> {
    if (!input.manaBilling) {
      return;
    }
    await callManaCore(
      `/reservations/${encodeURIComponent(input.manaBilling.reservationId)}/refund`,
      {
        manaAccountId: input.manaBilling.manaAccountId,
        reason: input.reason,
        metadata: {
          sourceAppId: input.manaBilling.sourceAppId,
          raidId: input.raidId,
          quoteId: input.manaBilling.quoteSnapshot?.quoteId,
        },
      }
    );
  }

  function buildBossRaidBillingMetadata(input: {
    manaBilling?: ManaBillingContext;
    settlement?: { capturedMana?: number; refundedMana?: number };
    selectedSeller?: string;
    receiptPath: string;
    modelId?: string;
    paidPriceUsd?: number;
    quoteSnapshot?: RaidQuoteSnapshot;
  }) {
    const quote = input.manaBilling?.quoteSnapshot ?? input.quoteSnapshot;
    const selected = quote?.providers.find(
      (provider) => provider.providerId === input.selectedSeller || provider.phase === 'primary'
    );
    const benchmarkPriceUsd =
      input.modelId != null || input.paidPriceUsd != null
        ? estimateBenchmarkPriceUsd({
            modelId: input.modelId,
            flatTaskUsd: input.paidPriceUsd,
          })
        : undefined;
    const savingsUsd =
      input.paidPriceUsd != null
        ? computeSavingsUsd(benchmarkPriceUsd, input.paidPriceUsd)
        : undefined;

    if (!input.manaBilling && !quote && input.paidPriceUsd == null) {
      return undefined;
    }

    return {
      quote_id: quote?.quoteId,
      selected_seller: input.selectedSeller ?? selected?.providerId,
      rate_card_hash: selected?.rateCard.rateCardHash,
      mana_reserved: input.manaBilling?.reservedMana,
      mana_captured: input.settlement?.capturedMana,
      mana_refunded: input.settlement?.refundedMana,
      benchmark_price_usd: benchmarkPriceUsd,
      savings_usd: savingsUsd,
      paid_price_usd: input.paidPriceUsd,
      receipt_path: input.receiptPath,
      attestation_result: selected?.attestationSummary,
      routing_proof: {
        strict_privacy: quote?.privacyMode === 'strict',
        required_privacy_features: quote?.requiredPrivacyFeatures,
        required_verification_status: quote?.requiredVerificationStatus,
        require_erc8004: quote?.requireErc8004,
        min_trust_score: quote?.minTrustScore,
      },
    };
  }

  function recordMarketplaceLedgersFromRaid(input: {
    raidId: string;
    route: 'raid' | 'chat' | 'inference';
    buyerWallet?: string;
    apiKeyId?: string;
    modelId?: string;
    costUsd?: number;
    skipBuyerPurchase?: boolean;
  }): void {
    const result = orchestrator.getResult(input.raidId);
    const costUsd =
      input.costUsd ??
      result.settlement?.successfulProvidersPaid ??
      result.settlement?.escrowFundingUsd ??
      0;
    if (!input.skipBuyerPurchase && input.buyerWallet && costUsd > 0) {
      const benchmarkPriceUsd = estimateBenchmarkPriceUsd({
        modelId: input.modelId,
        flatTaskUsd: costUsd,
      });
      controlState.recordBuyerPurchase({
        wallet: input.buyerWallet,
        apiKeyId: input.apiKeyId,
        raidId: input.raidId,
        modelId: input.modelId,
        sellerId:
          result.synthesizedOutput?.baseSubmissionProviderId ??
          result.approvedSubmissions?.[0]?.submission.providerId,
        costUsd,
        benchmarkPriceUsd,
        savingsUsd: computeSavingsUsd(benchmarkPriceUsd, costUsd),
        route: input.route,
      });
    }

    const payout = result.settlement?.payoutPerSuccessfulProvider ?? 0;
    const successfulProviderIds =
      result.settlementExecution?.successfulProviderIds ??
      result.approvedSubmissions?.map((entry) => entry.submission.providerId) ??
      [];
    for (const providerId of successfulProviderIds) {
      if (payout <= 0) {
        continue;
      }
      const txHash =
        result.settlementExecution?.childJobs?.find((job) => job.providerId === providerId)
          ?.fundTxHash ?? result.settlementExecution?.finalizeTxHash;
      controlState.recordSellerPayout({
        providerId,
        raidId: input.raidId,
        grossUsd: payout,
        status: result.status,
        txHash,
      });
    }
  }

  function captureApiKeyBilling(input: {
    apiKeyBilling?: ApiKeyBillingContext;
    actualCostUsd: number;
    route: 'raid' | 'chat' | 'inference';
    raidId: string;
    modelId?: string;
    sellerId?: string;
  }): void {
    if (!input.apiKeyBilling || input.actualCostUsd <= 0) {
      return;
    }
    controlState.recordBuyerApiKeyUsage(input.apiKeyBilling.apiKeyId, input.actualCostUsd);
    if (input.apiKeyBilling.useBalance) {
      controlState.debitBuyerBalance(input.apiKeyBilling.wallet, input.actualCostUsd);
    }
    const benchmarkPriceUsd = estimateBenchmarkPriceUsd({
      modelId: input.modelId,
      flatTaskUsd: input.actualCostUsd,
    });
    controlState.recordBuyerPurchase({
      wallet: input.apiKeyBilling.wallet,
      apiKeyId: input.apiKeyBilling.apiKeyId,
      raidId: input.raidId,
      modelId: input.modelId,
      sellerId: input.sellerId,
      costUsd: input.actualCostUsd,
      benchmarkPriceUsd,
      savingsUsd: computeSavingsUsd(benchmarkPriceUsd, input.actualCostUsd),
      route: input.route,
    });
  }

  async function requireReservedLaunchPayment(
    route: 'raid' | 'chat',
    request: FastifyRequest,
    input: BossRaidSpawnInput
  ): Promise<{
    settlement?: import('./x402.js').X402SettlementResponse;
    reservationId?: string;
    requestKey?: string;
    escrowFundingUsd?: number;
    platformMarkupUsd?: number;
    manaBilling?: ManaBillingContext;
    apiKeyBilling?: ApiKeyBillingContext;
  }> {
    const manaBillingHeaders = readManaBillingHeaders(request.headers);
    const requestKey = buildLaunchRequestKey(request, route, input);
    if (manaBillingHeaders) {
      const reservation = await orchestrator.reserveRaidLaunch(input, {
        route,
        requestKey,
        holdUntilUnix: Math.floor(Date.now() / 1_000) + 60,
      });
      const amount =
        reservation.quoteSnapshot?.manaQuote.maxChargeMana ??
        Math.ceil(reservation.sanitized.constraints.maxBudgetUsd * 1_000);
      const manaBilling = await reserveManaBilling({
        route,
        manaAccountId: manaBillingHeaders.manaAccountId,
        amount,
        requestKey,
        quoteSnapshot: reservation.quoteSnapshot,
      });
      return {
        reservationId: reservation.id,
        requestKey,
        manaBilling,
      };
    }

    const apiKey = readBuyerApiKey(request.headers);
    if (apiKey) {
      const reservation = await orchestrator.reserveRaidLaunch(input, {
        route,
        requestKey,
        holdUntilUnix: Math.floor(Date.now() / 1_000) + 60,
      });
      const amountUsd = reservation.sanitized.constraints.maxBudgetUsd;
      const account = controlState.readPublicAccount(apiKey.wallet);
      const spendCapOk =
        apiKey.spendLimitUsd == null || apiKey.spentUsd + amountUsd <= apiKey.spendLimitUsd;
      const balanceOk = account.balanceUsd >= amountUsd;
      if (!spendCapOk && !balanceOk) {
        throw new ApiContractError(
          'Insufficient API key spend limit or prepaid balance for this request.',
          402
        );
      }
      return {
        reservationId: reservation.id,
        requestKey,
        escrowFundingUsd: amountUsd,
        apiKeyBilling: {
          apiKeyId: apiKey.id,
          wallet: apiKey.wallet,
          reservedUsd: amountUsd,
          useBalance: balanceOk,
        },
      };
    }

    const x402Config = readX402Config(env);
    if (!x402Config.enabled) {
      return {};
    }

    const paymentSignature = asSingleHeader(request.headers['payment-signature']);
    const explicitReservationId = readX402ReservationId(request.headers);
    if (paymentSignature && !explicitReservationId) {
      throw new ApiContractError(
        'Paid requests must include X-BossRaid-Launch-Reservation from the payment challenge.'
      );
    }

    const reservation =
      explicitReservationId == null
        ? await orchestrator.reserveRaidLaunch(input, {
            route,
            requestKey,
            holdUntilUnix: Math.floor(Date.now() / 1_000) + x402Config.maxTimeoutSeconds,
          })
        : orchestrator.getRaidLaunchReservation(explicitReservationId, requestKey);

    if (!reservation) {
      throw new InvalidRaidLaunchReservationError(
        'Raid launch reservation is missing, expired, or does not match this request.'
      );
    }
    if (reservation.route !== route) {
      throw new InvalidRaidLaunchReservationError(
        `Raid launch reservation ${reservation.id} was created for /v1/${reservation.route}, not ${route}.`
      );
    }

    const paymentRequired = buildX402PaymentRequired({
      route,
      env,
      budgetUsd: reservation.sanitized.constraints.maxBudgetUsd,
      extra: {
        reservationId: reservation.id,
      },
      maxTimeoutSeconds: getLaunchReservationPaymentTimeoutSeconds(reservation),
    });

    const payment = await requireX402Payment({
      route,
      headers: request.headers,
      env,
      budgetUsd: reservation.sanitized.constraints.maxBudgetUsd,
      paymentRequired,
    });

    reservation.escrowFundingUsd = payment.escrowFundingUsd;
    reservation.platformMarkupUsd = payment.platformMarkupUsd;
    reservation.x402PaidAmountUsd = payment.paidAmountUsd;

    return {
      settlement: payment.settlement,
      reservationId: reservation.id,
      requestKey,
      escrowFundingUsd: payment.escrowFundingUsd,
      platformMarkupUsd: payment.platformMarkupUsd,
    };
  }

  async function spawnParsedRaid(
    request: FastifyRequest,
    reply: FastifyReply,
    parseInput: (value: unknown) => BossRaidSpawnInput,
    options: {
      requirePayment?: boolean;
    } = {}
  ) {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      'public-action',
      publicRateLimitMax,
      publicRateLimitWindowMs
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const input = parseInput(request.body);
    await ensureErc8004ProofState({ includeMercenary: false });
    const payment =
      options.requirePayment === false
        ? {}
        : await requireReservedLaunchPayment('raid', request, input);
    const response =
      payment.reservationId && payment.requestKey
        ? await orchestrator.spawnReservedRaid(
            payment.reservationId,
            payment.requestKey,
            payment.escrowFundingUsd,
            payment.platformMarkupUsd
          )
        : await orchestrator.spawnRaid(input, payment.escrowFundingUsd, payment.platformMarkupUsd);
    applyX402Headers(reply, {
      settlement: payment.settlement,
    });
    return response;
  }

  function registerRaidRoutes(basePath: '/v1/raid' | '/v1/raids'): void {
    app.get(`${basePath}/:raidId`, async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      return orchestrator.getStatus(raidId);
    });

    app.get(`${basePath}/:raidId/result`, async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      await ensureSettlementProofState(raidId);
      const result = orchestrator.getResult(raidId);
      if (result.status === 'final') {
        recordMarketplaceLedgersFromRaid({
          raidId,
          route: 'raid',
          skipBuyerPurchase: true,
        });
      }
      return result;
    });

    app.get(`${basePath}/:raidId/agent_log.json`, async (request, reply) => {
      const raidId = getRaidId(request);
      const queryAccessToken = readRaidAccessTokenQuery(request.query);
      const authorizationError = requireRaidReadAccess(
        reply,
        raidId,
        request.headers,
        queryAccessToken
      );
      if (authorizationError) {
        return authorizationError;
      }

      const raid = orchestrator.getRaid(raidId);
      if (!raid) {
        reply.code(404);
        return {
          error: 'not_found',
          message: `Unknown raid: ${raidId}`,
        };
      }

      reply.header('cache-control', 'private, no-store');
      await ensureSettlementProofState(raidId);
      await ensureErc8004ProofState({ includeMercenary: false });
      return buildAgentLog(raid, {
        getRaid: (currentRaidId) => orchestrator.getRaid(currentRaidId),
        getProvider: (providerId) => orchestrator.getProviderProfile(providerId),
        raidAccessToken:
          asSingleHeader(request.headers[RAID_ACCESS_TOKEN_HEADER]) ?? queryAccessToken,
      });
    });

    app.get(`${basePath}/:raidId/attested-result`, async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      if (!teeSigner.account) {
        reply.code(503);
        return {
          error: 'tee_signer_not_configured',
          message:
            teeSigner.error ??
            'MNEMONIC environment variable is required for attested raid result proofs.',
        };
      }

      await ensureSettlementProofState(raidId);
      const result = orchestrator.getResult(raidId);
      const payload = buildAttestedRaidResultPayload(env, result, workerIsolation);
      const message = buildAttestedRaidResultMessage(payload);
      const signature = await teeSigner.account.signMessage({ message });

      return {
        signer: teeSigner.account.address,
        message,
        messageHash: hashAttestationText(message),
        signature,
        payload,
      };
    });

    app.post(`${basePath}/:raidId/abort`, async (request, reply) => {
      const adminError = requireAdmin(reply, request.headers);
      if (adminError) {
        return adminError;
      }

      return orchestrator.abortRaid(getRaidId(request));
    });
  }

  async function collectProviderHealth() {
    return Promise.all(
      orchestrator.listProviders().map((provider) => probeProviderHealth(provider))
    );
  }

  app.get('/health', async () => {
    const providerHealth = await collectProviderHealth();
    const persistence = orchestrator.getPersistenceStatus();

    return {
      ok:
        persistence.healthy &&
        providerHealth.length > 0 &&
        providerHealth.every((provider) => provider.ready),
      providers: orchestrator.listProviders().length,
      readyProviders: providerHealth.filter((provider) => provider.ready).length,
      raids: orchestrator.listRaids().length,
    };
  });

  app.get('/ready', async () => {
    const providerHealth = await collectProviderHealth();
    const persistence = orchestrator.getPersistenceStatus();
    const x402Config = readX402Config(env);
    const settlementMode = env.BOSSRAID_SETTLEMENT_MODE ?? 'off';
    const settlementConfigured =
      settlementMode === 'off' ||
      Boolean(env.BOSSRAID_RPC_URL && env.BOSSRAID_REGISTRY_ADDRESS && env.BOSSRAID_ESCROW_ADDRESS);
    const teeSocketPath = env.BOSSRAID_TEE_SOCKET_PATH ?? '/var/run/tappd.sock';
    const tee = await readTeeSocketState(teeSocketPath);
    const secretsEncrypted =
      readStorageBackend(env) === 'memory' ||
      Boolean((env.BOSSRAID_SECRET_ENCRYPTION_KEY ?? env.BOSSRAID_ENCRYPTION_KEY)?.trim());
    const x402Configured =
      !x402Config.enabled ||
      (Boolean(x402Config.facilitatorUrl) &&
        x402Config.payTo !== '0x0000000000000000000000000000000000000000');
    const gates = {
      api: true,
      storage: persistence.healthy,
      secretsEncrypted,
      providers: providerHealth.length > 0 && providerHealth.some((provider) => provider.ready),
      x402: x402Configured,
      settlement: settlementConfigured,
      tee: {
        configured: Boolean(env.MNEMONIC),
        platform: env.BOSSRAID_TEE_PLATFORM ?? null,
        ...tee,
      },
    };

    return {
      ok:
        gates.api &&
        gates.storage &&
        gates.secretsEncrypted &&
        gates.providers &&
        gates.x402 &&
        gates.settlement,
      gates,
      providers: orchestrator.listProviders().length,
      readyProviders: providerHealth.filter((provider) => provider.ready).length,
      storage: persistence,
      encryption: {
        enabled: secretsEncrypted,
        keyId: env.BOSSRAID_SECRET_ENCRYPTION_KEY_ID ?? null,
      },
      payment: {
        enabled: x402Config.enabled,
        network: x402Config.network,
        asset: x402Config.asset,
        facilitatorConfigured: Boolean(x402Config.facilitatorUrl),
      },
      settlement: {
        mode: settlementMode,
        configured: settlementConfigured,
      },
    };
  });

  app.get('/metrics', async (request, reply) => {
    if (!metricsPublic) {
      const adminError = requireAdmin(reply, request.headers);
      if (adminError) {
        return adminError;
      }
    }

    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return apiMetrics.toPrometheus();
  });

  app.get('/v1/ops/metrics', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return apiMetrics.snapshot();
  });

  app.get('/v1/ops/production-readiness', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const providerHealth = await collectProviderHealth();
    const persistence = orchestrator.getPersistenceStatus();
    const x402Config = readX402Config(env);
    const settlementMode = env.BOSSRAID_SETTLEMENT_MODE ?? 'off';
    const teeSocketPath = env.BOSSRAID_TEE_SOCKET_PATH ?? '/var/run/tappd.sock';
    const tee = await readTeeSocketState(teeSocketPath);
    return buildProductionReadinessReport({
      env,
      storageBackend: readStorageBackend(env),
      persistenceHealthy: persistence.healthy,
      providers: orchestrator.listProviders(),
      providerHealth,
      x402: {
        enabled: x402Config.enabled,
        facilitatorConfigured: Boolean(x402Config.facilitatorUrl),
        payToConfigured: x402Config.payTo !== '0x0000000000000000000000000000000000000000',
        network: x402Config.network,
        asset: x402Config.asset,
      },
      settlement: {
        mode: settlementMode,
        configured:
          settlementMode === 'onchain' &&
          Boolean(
            env.BOSSRAID_RPC_URL &&
            env.BOSSRAID_CHAIN_ID &&
            env.BOSSRAID_REGISTRY_ADDRESS &&
            env.BOSSRAID_ESCROW_ADDRESS &&
            env.BOSSRAID_TOKEN_ADDRESS &&
            env.BOSSRAID_CLIENT_PRIVATE_KEY &&
            env.BOSSRAID_EVALUATOR_ADDRESS
          ),
      },
      tee: {
        configured: Boolean(env.MNEMONIC),
        platform: env.BOSSRAID_TEE_PLATFORM ?? null,
        ...tee,
      },
      limits: {
        publicRateLimitMax,
        publicRateLimitWindowMs,
        buyerKeyRateLimitMax,
        buyerKeyRateLimitWindowMs,
        buyerKeyDefaultSpendLimitUsd,
        buyerMaxRequestBudgetUsd,
      },
      workerIsolation,
    });
  });

  app.get('/v1/agent.json', async () => {
    await ensureErc8004ProofState();
    return buildAgentManifest(orchestrator, {
      runtimeExecutionRequested: readBooleanEnv(env.BOSSRAID_EVAL_RUNTIME_EXECUTION),
      runtimeExecutionEnabled: runtimeExecutionEnabled(env),
      evaluatorTransport: runtimeExecutionTransport(env),
      workerIsolation,
      maxEvaluatorJobs: evaluatorMaxConcurrentJobs,
      teeWalletAddress: teeSigner.account?.address ?? null,
      mercenaryIdentity,
    });
  });

  app.get('/v1/attested-runtime', async (_request, reply) => {
    if (!teeSigner.account) {
      reply.code(503);
      return {
        error: 'tee_signer_not_configured',
        message:
          teeSigner.error ??
          'MNEMONIC environment variable is required for attested runtime proofs.',
      };
    }

    const providerHealth = await collectProviderHealth();
    const payload = buildAttestedRuntimePayload(env, orchestrator, providerHealth, workerIsolation);
    const message = buildAttestedRuntimeMessage(payload);
    const signature = await teeSigner.account.signMessage({ message });

    return {
      signer: teeSigner.account.address,
      message,
      messageHash: hashAttestationText(message),
      signature,
      payload,
    };
  });

  app.post('/v1/auth/nonce', async (request) => {
    const input = ensureRecordInput(request.body, 'auth_nonce');
    const wallet = ensureOptionalStringInput(input.wallet, 'auth_nonce.wallet')?.toLowerCase();
    const nonce = controlState.createPublicAuthNonce(wallet, publicAuthNonceTtlSec);
    return {
      nonce: nonce.nonce,
      message: buildPublicAuthMessage(nonce.nonce),
      expiresAt: new Date(nonce.expiresAt).toISOString(),
    };
  });

  app.post('/v1/auth/verify', async (request, reply) => {
    const input = ensureRecordInput(request.body, 'auth_verify');
    const message = ensureStringInput(input.message, 'auth_verify.message');
    const signature = ensureStringInput(input.signature, 'auth_verify.signature') as `0x${string}`;
    const nonce = readNonceFromAuthMessage(message);
    if (!nonce) {
      reply.code(400);
      return {
        error: 'bad_request',
        message: 'Signed message is missing a Boss Raid nonce.',
      };
    }

    let wallet: string;
    try {
      wallet = (await recoverMessageAddress({ message, signature })).toLowerCase();
    } catch {
      reply.code(401);
      return {
        error: 'unauthorized',
        message: 'Wallet signature could not be verified.',
      };
    }

    const consumed = controlState.consumePublicAuthNonce(nonce, wallet);
    if (!consumed) {
      reply.code(401);
      return {
        error: 'unauthorized',
        message: 'Auth nonce is invalid or expired.',
      };
    }

    const session = issuePublicSessionCookie(reply, wallet);
    return {
      authenticated: true,
      wallet,
      expiresAt: new Date(session.expiresAt).toISOString(),
      account: buildPublicAccountResponse(controlState, wallet),
    };
  });

  app.get('/v1/session', async (request) => {
    const auth = readPublicAuth(request.headers);
    if (!auth) {
      return {
        authenticated: false,
      };
    }

    return {
      authenticated: true,
      wallet: auth.wallet,
      authType: auth.type,
      account: buildPublicAccountResponse(controlState, auth.wallet),
    };
  });

  app.delete('/v1/session', async (request, reply) => {
    clearPublicSession(reply, request.headers);
    return {
      authenticated: false,
    };
  });

  app.get('/v1/buyer/api-keys', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    return {
      data: controlState.listBuyerApiKeys(session.wallet).map((key) => sanitizeBuyerApiKey(key)),
    };
  });

  app.post('/v1/buyer/api-keys', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const input = ensureRecordInput(request.body, 'buyer_api_key');
    const name = ensureOptionalStringInput(input.name, 'buyer_api_key.name') ?? 'Default key';
    const requestedSpendLimit =
      input.spendLimitUsd == null && input.spend_limit_usd == null
        ? buyerKeyDefaultSpendLimitUsd
        : ensurePositiveNumberInput(
            input.spendLimitUsd ?? input.spend_limit_usd,
            'buyer_api_key.spend_limit_usd'
          );
    const rawKey = `br_${randomBytes(24).toString('base64url')}`;
    const key = controlState.createBuyerApiKey({
      wallet: session.wallet,
      name,
      keyHash: hashBuyerApiKey(rawKey),
      prefix: rawKey.slice(0, 10),
      spendLimitUsd: requestedSpendLimit,
    });
    reply.code(201);
    return {
      apiKey: rawKey,
      key: sanitizeBuyerApiKey(key),
    };
  });

  app.delete('/v1/buyer/api-keys/:keyId', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const keyId = (request.params as { keyId: string }).keyId;
    const revoked = controlState.revokeBuyerApiKey(session.wallet, keyId);
    if (!revoked) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { revoked: true };
  });

  app.get('/v1/seller/providers', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.readPublicAccount(session.wallet);
    return {
      data: orchestrator
        .listProviders()
        .filter((provider) => account.sellerProviderIds.includes(provider.providerId))
        .map((provider) => serializeProviderProfile(provider)),
    };
  });

  app.post('/v1/seller/providers', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const input = parseProviderRegistrationInput(
      buildSelfServeProviderRegistrationInput(request.body, session.wallet)
    );
    const provider = await orchestrator.upsertRegisteredProvider(input);
    controlState.linkSellerProvider(session.wallet, provider.providerId);
    const health = await probeProviderHealth(provider);
    const verification = buildProviderVerificationFromHealth(provider, health);
    const verifiedProvider = await orchestrator.upsertRegisteredProvider(
      buildProviderVerificationRegistrationInput(provider, verification)
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [verifiedProvider] });
    reply.code(201);
    return {
      provider: serializeProviderProfile(verifiedProvider, { includeEndpoint: true }),
      health: serializeProviderHealth(health, { includeDiagnostics: true, includeEndpoint: true }),
    };
  });

  app.patch('/v1/seller/providers/:providerId', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const providerId = (request.params as { providerId: string }).providerId;
    if (!controlState.sellerOwnsProvider(session.wallet, providerId)) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const input = parseProviderRegistrationInput(
      buildSelfServeProviderRegistrationInput(request.body, session.wallet, provider)
    );
    const updatedProvider = await orchestrator.upsertRegisteredProvider(input);
    await ensureErc8004ProofState({ includeMercenary: false, providers: [updatedProvider] });
    return serializeProviderProfile(updatedProvider, { includeEndpoint: true });
  });

  app.post('/v1/seller/providers/:providerId/verify', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const providerId = (request.params as { providerId: string }).providerId;
    if (!controlState.sellerOwnsProvider(session.wallet, providerId)) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const health = await probeProviderHealth(provider);
    const verification = buildProviderVerificationFromHealth(provider, health);
    const updatedProvider = await orchestrator.upsertRegisteredProvider(
      buildProviderVerificationRegistrationInput(provider, verification)
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [updatedProvider] });
    return {
      provider: serializeProviderProfile(updatedProvider, { includeEndpoint: true }),
      health: serializeProviderHealth(health, { includeDiagnostics: true, includeEndpoint: true }),
    };
  });

  app.get('/v1/seller/earnings', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.readPublicAccount(session.wallet);
    const stats = controlState.getSellerStats(account.sellerProviderIds);
    return {
      grossUsd: stats.grossUsd,
      payoutCount: stats.payoutCount,
      earnings24hUsd: stats.earnings24hUsd,
      routedRequests24h: stats.routedRequests24h,
      payouts: stats.payouts.map((entry) => ({
        raidId: entry.raidId,
        providerId: entry.providerId,
        grossUsd: entry.grossUsd,
        status: entry.status,
        txHash: entry.txHash,
        createdAt: entry.createdAt,
      })),
    };
  });

  app.get('/v1/seller/stats', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.readPublicAccount(session.wallet);
    const stats = controlState.getSellerStats(account.sellerProviderIds);
    const providers = orchestrator
      .listProviders()
      .filter((provider) => account.sellerProviderIds.includes(provider.providerId));
    return {
      grossUsd: stats.grossUsd,
      payoutCount: stats.payoutCount,
      earnings24hUsd: stats.earnings24hUsd,
      routedRequests24h: stats.routedRequests24h,
      activeOffers: providers.filter(
        (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active'
      ).length,
      pausedOffers: providers.filter((provider) => provider.marketplaceOfferStatus === 'paused')
        .length,
      providers: providers.map((provider) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        modelId: provider.modelId,
        marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
        verificationStatus: provider.verification?.status,
      })),
    };
  });

  app.get('/v1/buyer/purchases', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const query = request.query as { limit?: unknown };
    const limit = readPositiveInteger(asSingleQueryValue(query.limit), 100);
    const purchases = controlState.listBuyerPurchases(session.wallet, limit);
    const totalSpentUsd = purchases.reduce((sum, entry) => sum + entry.costUsd, 0);
    const totalSavingsUsd = purchases.reduce((sum, entry) => sum + (entry.savingsUsd ?? 0), 0);
    return {
      object: 'list',
      totalSpentUsd,
      totalSavingsUsd,
      data: purchases,
    };
  });

  app.get('/v1/buyer/balance', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.readPublicAccount(session.wallet);
    return {
      wallet: account.wallet,
      balanceUsd: account.balanceUsd,
      currency: 'USD',
    };
  });

  app.post('/v1/buyer/balance/fund', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const body = ensureRecordInput(request.body, 'buyer_balance_fund');
    const amountRaw = body.amountUsd ?? body.amount_usd;
    const amountUsd =
      typeof amountRaw === 'number'
        ? amountRaw
        : readPositiveNumber(typeof amountRaw === 'string' ? amountRaw : undefined);
    if (amountUsd == null || amountUsd <= 0) {
      reply.code(400);
      return { error: 'invalid_amount', message: 'amountUsd must be a positive number.' };
    }
    const account = controlState.creditBuyerBalance(session.wallet, amountUsd);
    return {
      wallet: account.wallet,
      balanceUsd: account.balanceUsd,
      creditedUsd: amountUsd,
      currency: 'USD',
    };
  });

  app.get('/v1/models', async (request) => {
    const query = request.query as {
      model?: unknown;
      model_id?: unknown;
      provider?: unknown;
      model_provider?: unknown;
      framework?: unknown;
      agent_framework?: unknown;
      max_budget?: unknown;
      max_budget_usd?: unknown;
      privacy_mode?: unknown;
      verification_status?: unknown;
    };
    const markets = buildInferenceMarketSnapshot({
      modelId: asSingleQueryValue(query.model_id) ?? asSingleQueryValue(query.model),
      modelProvider: asSingleQueryValue(query.model_provider) ?? asSingleQueryValue(query.provider),
      agentFramework:
        asSingleQueryValue(query.agent_framework) ?? asSingleQueryValue(query.framework),
      maxBudgetUsd: readPositiveNumber(
        asSingleQueryValue(query.max_budget_usd) ?? asSingleQueryValue(query.max_budget)
      ),
      privacyMode: asSingleQueryValue(query.privacy_mode),
      verificationStatus: asSingleQueryValue(query.verification_status),
    });

    return {
      object: 'list',
      data: markets.map((market) => buildOpenAiCompatibleModelEntry(market)),
    };
  });

  app.get('/v1/prices', async (request) => {
    const query = request.query as {
      model?: unknown;
      model_id?: unknown;
      provider?: unknown;
      model_provider?: unknown;
      framework?: unknown;
      agent_framework?: unknown;
      max_budget?: unknown;
      max_budget_usd?: unknown;
      privacy_mode?: unknown;
      verification_status?: unknown;
    };
    return {
      object: 'list',
      benchmark: {
        source: 'models.dev',
        url: 'https://models.dev/api.json',
        mode: 'static_reference_only',
      },
      data: buildInferenceMarketSnapshot({
        modelId: asSingleQueryValue(query.model_id) ?? asSingleQueryValue(query.model),
        modelProvider:
          asSingleQueryValue(query.model_provider) ?? asSingleQueryValue(query.provider),
        agentFramework:
          asSingleQueryValue(query.agent_framework) ?? asSingleQueryValue(query.framework),
        maxBudgetUsd: readPositiveNumber(
          asSingleQueryValue(query.max_budget_usd) ?? asSingleQueryValue(query.max_budget)
        ),
        privacyMode: asSingleQueryValue(query.privacy_mode),
        verificationStatus: asSingleQueryValue(query.verification_status),
      }).map((market) => buildInferencePriceEntry(market)),
    };
  });

  app.get('/v1/markets', async (request) => {
    const query = request.query as {
      model?: unknown;
      model_id?: unknown;
      provider?: unknown;
      model_provider?: unknown;
      framework?: unknown;
      agent_framework?: unknown;
      max_budget?: unknown;
      max_budget_usd?: unknown;
      privacy_mode?: unknown;
      verification_status?: unknown;
    };
    const marketData = buildInferenceMarketSnapshot({
      modelId: asSingleQueryValue(query.model_id) ?? asSingleQueryValue(query.model),
      modelProvider: asSingleQueryValue(query.model_provider) ?? asSingleQueryValue(query.provider),
      agentFramework:
        asSingleQueryValue(query.agent_framework) ?? asSingleQueryValue(query.framework),
      maxBudgetUsd: readPositiveNumber(
        asSingleQueryValue(query.max_budget_usd) ?? asSingleQueryValue(query.max_budget)
      ),
      privacyMode: asSingleQueryValue(query.privacy_mode),
      verificationStatus: asSingleQueryValue(query.verification_status),
    });
    const providers = orchestrator.listProviders();
    const activeOffers = providers.filter(
      (provider) =>
        (provider.marketplaceOfferStatus ?? 'active') === 'active' && provider.status !== 'offline'
    ).length;
    const sellerPayouts = controlState.listSellerPayouts(
      providers.map((provider) => provider.providerId),
      10_000
    );
    const since24h = Date.now() - 24 * 60 * 60 * 1_000;
    const routedRequests24h = sellerPayouts.filter(
      (entry) => Date.parse(entry.createdAt) >= since24h
    ).length;
    const earnedBySellers24hUsd = sellerPayouts
      .filter((entry) => Date.parse(entry.createdAt) >= since24h)
      .reduce((sum, entry) => sum + entry.grossUsd, 0);

    return {
      object: 'list',
      stats: {
        activeOffers,
        modelsLive: marketData.length,
        routedRequests24h,
        earnedBySellers24hUsd,
      },
      settlement: {
        asset: 'USDC',
        network: env.BOSSRAID_X402_NETWORK ?? 'base-sepolia',
        rule: 'single-provider inference pays the selected successful seller its declared rate; multi-agent raids split successful payouts equally.',
      },
      custody: {
        sellerCredentialPolicy:
          'Sellers expose clean authenticated endpoints. Boss Raid does not require buyers to receive seller provider keys or subscription credentials.',
        privacyPolicy:
          'Strict private routing requires privacy metadata and Phala/TEE attestation where configured.',
      },
      data: marketData,
    };
  });

  app.get('/v1/marketplace/stats', async () => {
    const providers = orchestrator.listProviders();
    const markets = buildInferenceMarkets(
      providers.filter(
        (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active' && provider.modelId
      )
    );
    const sellerPayouts = controlState.listSellerPayouts(
      providers.map((provider) => provider.providerId),
      10_000
    );
    const since24h = Date.now() - 24 * 60 * 60 * 1_000;
    const recentPayouts = sellerPayouts.filter((entry) => Date.parse(entry.createdAt) >= since24h);
    return {
      activeOffers: providers.filter(
        (provider) =>
          (provider.marketplaceOfferStatus ?? 'active') === 'active' &&
          provider.status !== 'offline'
      ).length,
      sellerOffersActive: providers.filter(
        (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active'
      ).length,
      modelsLive: markets.length,
      routedRequests24h: recentPayouts.length,
      earnedBySellers24hUsd: recentPayouts.reduce((sum, entry) => sum + entry.grossUsd, 0),
    };
  });

  app.get('/v1/runtime', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const teeSocketPath = env.BOSSRAID_TEE_SOCKET_PATH ?? '/var/run/tappd.sock';
    return {
      deploymentTarget: env.BOSSRAID_DEPLOY_TARGET ?? null,
      nodeEnv: env.NODE_ENV ?? null,
      storageBackend: readStorageBackend(env),
      trustProxy,
      bodyLimitBytes: apiBodyLimitBytes,
      providerHealthTimeoutMs,
      publicRateLimit: {
        max: publicRateLimitMax,
        windowMs: publicRateLimitWindowMs,
      },
      opsSession: {
        ttlSec: opsSessionTtlSec,
        rateLimitMax: opsSessionRateLimitMax,
        rateLimitWindowMs: opsSessionRateLimitWindowMs,
      },
      evaluator: {
        runtimeExecutionRequested: readBooleanEnv(env.BOSSRAID_EVAL_RUNTIME_EXECUTION),
        runtimeExecutionEnabled: runtimeExecutionEnabled(env),
        transport: runtimeExecutionTransport(env),
        sandboxMode: env.BOSSRAID_EVAL_SANDBOX_MODE ?? 'host',
        workerIsolation,
        jobTimeoutMs: readPositiveInteger(
          env.BOSSRAID_EVAL_JOB_TIMEOUT_MS,
          DEFAULTS.EVAL_JOB_TIMEOUT_MS
        ),
        jobContainerImageConfigured: Boolean(env.BOSSRAID_EVAL_JOB_CONTAINER_IMAGE),
        dockerSocketConfigured: Boolean(env.BOSSRAID_EVAL_DOCKER_SOCKET_PATH),
        sandboxUrlConfigured: Boolean(env.BOSSRAID_EVAL_SANDBOX_URL),
        sandboxSocketConfigured: Boolean(env.BOSSRAID_EVAL_SANDBOX_SOCKET),
        sandboxTokenConfigured: Boolean(env.BOSSRAID_EVAL_SANDBOX_TOKEN),
        unsafeHostExecutionAllowed: unsafeHostExecutionAllowed(env),
      },
      tee: {
        platform: env.BOSSRAID_TEE_PLATFORM ?? null,
        socketPath: teeSocketPath,
        appWalletConfigured: Boolean(teeSigner.account),
        appWalletAddress: teeSigner.account?.address ?? null,
        appWalletError: teeSigner.error ?? null,
        ...(await readTeeSocketState(teeSocketPath)),
      },
    };
  });

  app.post('/v1/runtime/evaluator-smoke', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    if (!runtimeExecutionEnabled(env)) {
      reply.code(503);
      return {
        error: 'runtime_execution_disabled',
        message: 'Runtime execution must be enabled before evaluator smoke checks can run.',
        evaluator: {
          transport: runtimeExecutionTransport(env),
          workerIsolation,
        },
      };
    }

    const smoke = buildEvaluatorSmokeTask();
    const workspacePath = await materializeWorkspace(smoke.files);

    try {
      const result = await runRuntimeProbes(smoke.task, workspacePath, smoke.touchedFiles, env);
      return {
        evaluator: {
          transport: runtimeExecutionTransport(env),
          workerIsolation,
        },
        result,
      };
    } finally {
      await cleanupWorkspace(workspacePath);
    }
  });

  app.get('/v1/ops/session', async (request, reply) => {
    if (!adminToken) {
      reply.code(503);
      return {
        error: 'admin_auth_not_configured',
        message: 'BOSSRAID_ADMIN_TOKEN is required for this route.',
      };
    }

    const session = readOpsSession(request.headers);
    if (
      session ||
      safeEqualString(asSingleHeader(request.headers.authorization), `Bearer ${adminToken}`)
    ) {
      return {
        authenticated: true,
        expiresAt: session ? new Date(session.expiresAt).toISOString() : undefined,
      };
    }

    reply.code(401);
    return {
      authenticated: false,
      error: 'unauthorized',
    };
  });
  app.post('/v1/ops/session', async (request, reply) => {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      'ops-session',
      opsSessionRateLimitMax,
      opsSessionRateLimitWindowMs
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    if (!adminToken) {
      reply.code(503);
      return {
        error: 'admin_auth_not_configured',
        message: 'BOSSRAID_ADMIN_TOKEN is required for this route.',
      };
    }

    const credentials = parseOpsSessionInput(request.body);
    if (!safeEqualString(credentials.token, adminToken)) {
      reply.code(401);
      return {
        authenticated: false,
        error: 'unauthorized',
      };
    }

    const session = issueOpsSession(reply);
    return {
      authenticated: true,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  });
  app.delete('/v1/ops/session', async (request, reply) => {
    clearOpsSession(reply, request.headers);
    return {
      authenticated: false,
    };
  });

  app.get('/v1/ops/settlement/status', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const settlementMode = env.BOSSRAID_SETTLEMENT_MODE ?? 'off';
    const rpcUrl = env.BOSSRAID_RPC_URL;
    const chainId = env.BOSSRAID_CHAIN_ID;
    const registryAddress = env.BOSSRAID_REGISTRY_ADDRESS;
    const escrowAddress = env.BOSSRAID_ESCROW_ADDRESS;
    const tokenAddress = env.BOSSRAID_TOKEN_ADDRESS;

    return {
      mode: settlementMode,
      configured: settlementMode !== 'off' && Boolean(rpcUrl && registryAddress && escrowAddress),
      chain: chainId ? { id: chainId } : null,
      contracts: {
        registry: registryAddress ?? null,
        escrow: escrowAddress ?? null,
        token: tokenAddress ?? null,
      },
      rpcUrl: rpcUrl ? new URL(rpcUrl).host : null,
    };
  });

  app.get('/v1/raids', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return orchestrator.listRaids().map((raid) => ({
      raidId: raid.id,
      status: raid.status,
      createdAt: raid.createdAt,
      updatedAt: raid.updatedAt,
      bestCurrentScore: raid.bestCurrentScore,
      firstValidSubmissionId: raid.firstValidSubmissionId,
      primarySubmissionId: raid.primarySubmissionId,
      successfulSubmissionCount: raid.rankedSubmissions.filter((item) => item.breakdown.valid)
        .length,
    }));
  });
  app.post('/v1/inference/chat/completions', async (request, reply) =>
    handleChatCompletionRequest(request, reply, { discountInference: true })
  );
  app.post('/v1/chat/completions', async (request, reply) =>
    handleChatCompletionRequest(request, reply)
  );
  app.post('/v1/raid', async (request, reply) => {
    return spawnParsedRaid(request, reply, parseBossRaidRequest);
  });
  app.post('/v1/demo/raid', async (request, reply) => {
    const demoAccessError = requireDemoRouteAccess(reply, request.headers);
    if (demoAccessError) {
      return demoAccessError;
    }

    return spawnParsedRaid(request, reply, parseBossRaidRequest, {
      requirePayment: false,
    });
  });
  app.post('/v1/raids', async (request, reply) => {
    return spawnParsedRaid(request, reply, parseBossRaidSpawnInput);
  });
  registerRaidRoutes('/v1/raid');
  registerRaidRoutes('/v1/raids');
  app.post('/v1/evaluations/:raidId/replay', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return orchestrator.replayEvaluation((request.params as { raidId: string }).raidId);
  });
  app.post('/v1/providers/:providerId/heartbeat', async (request, reply) => {
    const params = request.params as { providerId: string };
    if (
      !providerIsAuthorized(params.providerId, {
        method: request.method,
        path: request.url,
        body: request.body,
        headers: request.headers,
      })
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const heartbeat = parseProviderHeartbeat(request.body, params.providerId);
    const validation = validateProviderCallback(
      heartbeat.raidId,
      params.providerId,
      heartbeat.providerRunId
    );
    if (!validation.ok) {
      reply.code(validation.statusCode);
      return validation.body;
    }
    return orchestrator.recordProviderHeartbeat(heartbeat.raidId, params.providerId, heartbeat);
  });
  app.post(
    '/v1/providers/:providerId/submit',
    { bodyLimit: providerSubmissionBodyLimitBytes },
    async (request, reply) => {
      const params = request.params as { providerId: string };
      if (
        !providerIsAuthorized(params.providerId, {
          method: request.method,
          path: request.url,
          body: request.body,
          headers: request.headers,
        })
      ) {
        reply.code(401);
        return { error: 'unauthorized' };
      }
      const submission = parseProviderSubmission(request.body, params.providerId);
      const validation = validateProviderCallback(
        submission.raidId,
        params.providerId,
        submission.providerRunId
      );
      if (!validation.ok) {
        reply.code(validation.statusCode);
        return validation.body;
      }
      return orchestrator.recordProviderSubmission(submission.raidId, submission);
    }
  );
  app.post('/v1/providers/:providerId/failure', async (request, reply) => {
    const params = request.params as { providerId: string };
    if (
      !providerIsAuthorized(params.providerId, {
        method: request.method,
        path: request.url,
        body: request.body,
        headers: request.headers,
      })
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const failure = parseProviderFailure(request.body, params.providerId);
    const validation = validateProviderCallback(
      failure.raidId,
      params.providerId,
      failure.providerRunId
    );
    if (!validation.ok) {
      reply.code(validation.statusCode);
      return validation.body;
    }
    return orchestrator.recordProviderFailure(failure.raidId, params.providerId, failure);
  });
  app.get('/v1/providers', async () => {
    const providers = orchestrator.listProviders();
    await ensureErc8004ProofState({ includeMercenary: false, providers });
    return providers.map((provider) => serializeProviderProfile(provider));
  });
  app.get('/v1/providers/health', async () =>
    (
      await Promise.all(
        orchestrator.listProviders().map((provider) => probeProviderHealth(provider))
      )
    ).map((health) => serializeProviderHealth(health))
  );
  app.get('/v1/providers/:providerId/stats', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const providerId = (request.params as { providerId: string }).providerId;
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });

  app.get('/v1/raid/:raidId/provider-settlement', async (request, reply) => {
    const raidId = (request.params as { raidId: string }).raidId;
    const query = request.query as { providerId?: unknown; provider_id?: unknown };
    const providerId =
      asSingleQueryValue(query.providerId) ?? asSingleQueryValue(query.provider_id);
    if (!providerId) {
      reply.code(400);
      return {
        error: 'bad_request',
        message: 'providerId is required.',
      };
    }
    const authorizationError = requireProviderOrRaidReadAccess(reply, raidId, providerId, {
      method: request.method,
      path: request.url,
      body: {},
      bodyText: '',
      headers: request.headers,
    });
    if (authorizationError) {
      return authorizationError;
    }
    const payload = await buildProviderSettlementPayload(raidId, providerId);
    if (!payload) {
      reply.code(404);
      return {
        error: 'not_found',
        message: `No settlement data for provider ${providerId} on raid ${raidId}.`,
      };
    }
    return payload;
  });

  app.post('/agents/register', async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: 'registry_auth_not_configured' };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const provider = await orchestrator.upsertRegisteredProvider(
      parseProviderRegistrationInput(request.body)
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });
  app.post('/agents/:providerId/verify', async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: 'registry_auth_not_configured' };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const providerId = (request.params as { providerId: string }).providerId;
    const provider = orchestrator
      .listProviders()
      .find((item) => item.providerId === providerId || item.agentId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const health = await probeProviderHealth(provider);
    const verification = buildProviderVerificationFromHealth(provider, health);
    const updatedProvider = await orchestrator.upsertRegisteredProvider(
      buildProviderVerificationRegistrationInput(provider, verification)
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [updatedProvider] });
    return {
      provider: serializeProviderProfile(updatedProvider, { includeEndpoint: true }),
      health: serializeProviderHealth(health, { includeDiagnostics: true, includeEndpoint: true }),
    };
  });
  app.post('/agents/heartbeat', async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: 'registry_auth_not_configured' };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const provider = await orchestrator.recordAgentHeartbeat(
      parseAgentHeartbeatInput(request.body)
    );
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });
  app.get('/agents/discover', async (request) => {
    await ensureErc8004ProofState({ includeMercenary: false });
    return (await orchestrator.discoverProviders(parseProviderDiscoveryQuery(request.query))).map(
      (provider) => serializeProviderProfile(provider)
    );
  });

  return app;
}

const OPS_SESSION_COOKIE_NAME = 'bossraid_ops_session';
const PUBLIC_SESSION_COOKIE_NAME = 'bossraid_session';
const RAID_ACCESS_TOKEN_HEADER = 'x-bossraid-raid-token';

function hashRaidAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function asSingleQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

interface InferenceMarketSeller {
  sellerId: string;
  displayName: string;
  modelProvider?: string;
  agentFramework?: string;
  rateUsd: number;
  pricing: {
    unit: 'task' | 'token_metered';
    pricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
    minimumChargeUsd: number | null;
    currency: string;
    validFrom?: string;
    validUntil?: string;
    rateCardVersion?: string;
    rateCardHash?: string;
    upstreamModelId?: string;
    maxContextTokens?: number;
  };
  status: ProviderProfile['status'];
  marketplaceOfferStatus: 'active' | 'paused';
  verificationStatus?: string;
  privacy: {
    teeAttested?: boolean;
    e2ee?: boolean;
    signedOutputs?: boolean;
    noDataRetention?: boolean;
  };
  outputTypes?: string[];
  maxConcurrency: number;
}

interface InferenceMarket {
  object: 'inference.market';
  modelId: string;
  modelProvider?: string;
  providerCount: number;
  activeProviderCount: number;
  verifiedSellerCount: number;
  privateSellerCount: number;
  recentSuccessRate: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  cheapestRateUsd: number | null;
  pricing: {
    benchmarkSource: 'models.dev';
    benchmarkUrl: 'https://models.dev/api.json';
    benchmarkMode: 'static_reference_only';
    declaredUnit: 'task' | 'token_metered';
    cheapestPricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
  };
  sellers: InferenceMarketSeller[];
}

function forceDiscountInferenceChatPolicy(
  chatRequest: ChatCompletionRequest,
  options: {
    defaultMaxTotalCost?: number;
    strictAlkahestLane?: boolean;
  } = {}
): ChatCompletionRequest {
  const policy = (chatRequest.raidPolicy ?? {}) as Record<string, unknown>;
  const existingAllowedModelIds = readPolicyStringArray(
    policy.allowedModelIds ?? policy.allowed_model_ids
  );
  const existingAllowedOutputTypes = readPolicyStringArray(
    policy.allowedOutputTypes ?? policy.allowed_output_types
  );
  const maxTotalCost = policy.maxTotalCost ?? policy.max_total_cost ?? options.defaultMaxTotalCost;
  const privacyMode = options.strictAlkahestLane
    ? 'strict'
    : (readPrivacyMode(policy.privacyMode) ?? readPrivacyMode(policy.privacy_mode) ?? 'prefer');
  const requiredPrivacyFeatures = options.strictAlkahestLane
    ? (['tee_attested', 'e2ee', 'signed_outputs', 'no_data_retention'] as NonNullable<
        ChatCompletionRequest['raidPolicy']
      >['requirePrivacyFeatures'])
    : undefined;

  return {
    ...chatRequest,
    raidPolicy: {
      ...chatRequest.raidPolicy,
      maxAgents: 1,
      maxTotalCost: maxTotalCost as number | string | undefined,
      allowedModelIds:
        existingAllowedModelIds && existingAllowedModelIds.length > 0
          ? existingAllowedModelIds
          : [chatRequest.model],
      allowedOutputTypes:
        existingAllowedOutputTypes && existingAllowedOutputTypes.length > 0
          ? (existingAllowedOutputTypes as NonNullable<
              ChatCompletionRequest['raidPolicy']
            >['allowedOutputTypes'])
          : ['text', 'json'],
      privacyMode,
      requirePrivacyFeatures:
        requiredPrivacyFeatures ?? chatRequest.raidPolicy?.requirePrivacyFeatures,
      requireErc8004: options.strictAlkahestLane ? true : chatRequest.raidPolicy?.requireErc8004,
      minTrustScore: options.strictAlkahestLane
        ? Math.max(Number(policy.minTrustScore ?? policy.min_trust_score ?? 0), 80)
        : chatRequest.raidPolicy?.minTrustScore,
      requiredVerificationStatus: options.strictAlkahestLane
        ? 'verified'
        : chatRequest.raidPolicy?.requiredVerificationStatus,
      allowedModelProviders: options.strictAlkahestLane
        ? ['google']
        : chatRequest.raidPolicy?.allowedModelProviders,
      selectionMode: 'cost_first',
    },
  };
}

function readTrustedAlkahestClient(
  headers: Record<string, string | string[] | undefined>
): { sourceAppId: 'alkahest' } | undefined {
  const clientId = asSingleHeader(headers['x-bossraid-client-id']);
  const sourceAppId = asSingleHeader(headers['x-bossraid-source-app-id']);
  if (clientId !== 'alkahest' && sourceAppId !== 'alkahest') {
    return undefined;
  }
  return { sourceAppId: 'alkahest' };
}

function readPrivacyMode(
  value: unknown
): NonNullable<ChatCompletionRequest['raidPolicy']>['privacyMode'] {
  return value === 'off' || value === 'prefer' || value === 'strict' ? value : undefined;
}

function resolveDiscountInferenceDefaultMaxTotalCost(
  chatRequest: ChatCompletionRequest,
  providers: ProviderProfile[]
): number | undefined {
  const policy = (chatRequest.raidPolicy ?? {}) as Record<string, unknown>;
  if (policy.maxTotalCost != null || policy.max_total_cost != null) {
    return undefined;
  }

  const modelIds = readPolicyStringArray(policy.allowedModelIds ?? policy.allowed_model_ids) ?? [
    chatRequest.model,
  ];
  const modelProviders = readPolicyStringArray(
    policy.allowedModelProviders ?? policy.allowed_model_providers
  );
  const agentFrameworks = readPolicyStringArray(
    policy.allowedAgentFrameworks ?? policy.allowed_agent_frameworks
  );
  const requiredVerificationStatus =
    typeof policy.requiredVerificationStatus === 'string'
      ? policy.requiredVerificationStatus
      : typeof policy.required_verification_status === 'string'
        ? policy.required_verification_status
        : undefined;
  const privacyMode = readPrivacyMode(policy.privacyMode) ?? readPrivacyMode(policy.privacy_mode);
  const requireErc8004 = policy.requireErc8004 === true || policy.require_erc8004 === true;
  const minTrustScoreValue = Number(policy.minTrustScore ?? policy.min_trust_score);
  const minTrustScore = Number.isFinite(minTrustScoreValue) ? minTrustScoreValue : undefined;
  const rates = providers
    .filter((provider) => {
      if ((provider.marketplaceOfferStatus ?? 'active') === 'paused') {
        return false;
      }
      if (modelIds.length > 0 && !provider.modelId) {
        return false;
      }
      if (modelIds.length > 0 && provider.modelId && !modelIds.includes(provider.modelId)) {
        return false;
      }
      if (
        modelProviders &&
        modelProviders.length > 0 &&
        (!provider.modelProvider || !modelProviders.includes(provider.modelProvider))
      ) {
        return false;
      }
      if (
        agentFrameworks &&
        agentFrameworks.length > 0 &&
        (!provider.agentFramework || !agentFrameworks.includes(provider.agentFramework))
      ) {
        return false;
      }
      if (
        requiredVerificationStatus &&
        provider.verification?.status !== requiredVerificationStatus
      ) {
        return false;
      }
      if (privacyMode === 'strict' && !providerHasStrictPrivateMarketMetadata(provider)) {
        return false;
      }
      if (requireErc8004 && !provider.erc8004?.agentId) {
        return false;
      }
      if (
        typeof minTrustScore === 'number' &&
        (provider.trust?.score ?? (provider.erc8004?.registrationTx ? 80 : 0)) < minTrustScore
      ) {
        return false;
      }
      return (
        provider.status === 'available' && Number.isFinite(readProviderMarketRateUsd(provider))
      );
    })
    .map((provider) => readProviderMarketRateUsd(provider))
    .sort((left, right) => left - right);

  return rates[0];
}

function readPolicyStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return undefined;
}

function resolveProviderMarketModelId(provider: ProviderProfile): string | undefined {
  return provider.modelId ?? provider.modelFamily;
}

function readProviderPricing(provider: ProviderProfile): ProviderPricing {
  return (
    provider.pricing ?? {
      mode: 'task',
      currency: 'USD',
      pricePerTaskUsd: provider.pricePerTaskUsd,
      rateCardHash: createHash('sha256')
        .update(
          JSON.stringify({
            mode: 'task',
            currency: 'USD',
            pricePerTaskUsd: provider.pricePerTaskUsd,
          })
        )
        .digest('hex'),
    }
  );
}

function readProviderMarketRateUsd(provider: ProviderProfile): number {
  const pricing = readProviderPricing(provider);
  if (pricing.mode === 'task') {
    return pricing.pricePerTaskUsd ?? provider.pricePerTaskUsd;
  }
  return pricing.minimumChargeUsd ?? 0;
}

function buildInferenceMarkets(providers: ProviderProfile[]): InferenceMarket[] {
  const byModel = new Map<string, ProviderProfile[]>();
  for (const provider of providers) {
    const modelId = resolveProviderMarketModelId(provider);
    if (!modelId) {
      continue;
    }
    byModel.set(modelId, [...(byModel.get(modelId) ?? []), provider]);
  }

  return [...byModel.entries()]
    .map(([modelId, marketProviders]) => {
      const sellers = marketProviders
        .map((provider) => buildInferenceMarketSeller(provider))
        .sort(
          (left, right) =>
            left.rateUsd - right.rateUsd || left.sellerId.localeCompare(right.sellerId)
        );
      const activeSellers = sellers.filter(
        (seller) =>
          seller.status === 'available' && (seller.marketplaceOfferStatus ?? 'active') === 'active'
      );
      const cheapestRateUsd = activeSellers[0]?.rateUsd ?? sellers[0]?.rateUsd ?? null;
      const declaredUnit: InferenceMarket['pricing']['declaredUnit'] = sellers.some(
        (seller) => seller.pricing.unit === 'token_metered'
      )
        ? 'token_metered'
        : 'task';
      const successfulRaids = marketProviders.reduce(
        (total, provider) => total + provider.reputation.totalSuccessfulRaids,
        0
      );
      const totalRaids = marketProviders.reduce(
        (total, provider) => total + provider.reputation.totalRaids,
        0
      );
      const latencies = marketProviders
        .map((provider) => provider.reputation.p50LatencyMs)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
      const p95Latencies = marketProviders
        .map((provider) => provider.reputation.p95LatencyMs)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
      return {
        object: 'inference.market' as const,
        modelId,
        modelProvider:
          marketProviders.find((provider) => provider.modelProvider)?.modelProvider ?? undefined,
        providerCount: sellers.length,
        activeProviderCount: activeSellers.length,
        verifiedSellerCount: marketProviders.filter(
          (provider) => provider.verification?.status === 'verified'
        ).length,
        privateSellerCount: marketProviders.filter(
          (provider) =>
            provider.privacy?.teeAttested ||
            provider.privacy?.signedOutputs ||
            provider.privacy?.noDataRetention
        ).length,
        recentSuccessRate: totalRaids > 0 ? successfulRaids / totalRaids : null,
        p50LatencyMs: latencies[0] ?? null,
        p95LatencyMs: p95Latencies[p95Latencies.length - 1] ?? null,
        cheapestRateUsd,
        pricing: {
          benchmarkSource: 'models.dev' as const,
          benchmarkUrl: 'https://models.dev/api.json' as const,
          benchmarkMode: 'static_reference_only' as const,
          declaredUnit,
          cheapestPricePerTaskUsd: cheapestRateUsd,
          pricePer1mInputTokensUsd:
            activeSellers.find((seller) => seller.pricing.pricePer1mInputTokensUsd != null)?.pricing
              .pricePer1mInputTokensUsd ?? null,
          pricePer1mOutputTokensUsd:
            activeSellers.find((seller) => seller.pricing.pricePer1mOutputTokensUsd != null)
              ?.pricing.pricePer1mOutputTokensUsd ?? null,
        },
        sellers,
      };
    })
    .sort((left, right) => {
      const leftRate = left.cheapestRateUsd ?? Number.POSITIVE_INFINITY;
      const rightRate = right.cheapestRateUsd ?? Number.POSITIVE_INFINITY;
      return leftRate - rightRate || left.modelId.localeCompare(right.modelId);
    });
}

function buildInferenceMarketSeller(provider: ProviderProfile): InferenceMarketSeller {
  const pricing = readProviderPricing(provider);
  return {
    sellerId: provider.providerId,
    displayName: provider.displayName,
    modelProvider: provider.modelProvider,
    agentFramework: provider.agentFramework,
    rateUsd: readProviderMarketRateUsd(provider),
    pricing: {
      unit: pricing.mode,
      pricePerTaskUsd: pricing.pricePerTaskUsd ?? null,
      pricePer1mInputTokensUsd: pricing.pricePer1mInputTokensUsd ?? null,
      pricePer1mOutputTokensUsd: pricing.pricePer1mOutputTokensUsd ?? null,
      minimumChargeUsd: pricing.minimumChargeUsd ?? null,
      currency: pricing.currency,
      validFrom: pricing.validFrom,
      validUntil: pricing.validUntil,
      rateCardVersion: pricing.rateCardVersion,
      rateCardHash: pricing.rateCardHash,
      upstreamModelId: pricing.upstreamModelId,
      maxContextTokens: pricing.maxContextTokens,
    },
    status: provider.status,
    marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
    verificationStatus: provider.verification?.status,
    privacy: {
      teeAttested: provider.privacy?.teeAttested,
      e2ee: provider.privacy?.e2ee,
      signedOutputs: provider.privacy?.signedOutputs,
      noDataRetention: provider.privacy?.noDataRetention,
    },
    outputTypes: provider.outputTypes,
    maxConcurrency: provider.maxConcurrency,
  };
}

function providerHasStrictPrivateMarketMetadata(provider: ProviderProfile): boolean {
  return Boolean(
    provider.privacy?.teeAttested &&
    provider.privacy?.e2ee &&
    provider.privacy?.signedOutputs &&
    provider.privacy?.noDataRetention
  );
}

function buildOpenAiCompatibleModelEntry(market: InferenceMarket) {
  return {
    id: market.modelId,
    object: 'model',
    created: 0,
    owned_by: market.modelProvider ?? 'bossraid-market',
    pricing: market.pricing,
    bossraid: {
      provider_count: market.providerCount,
      active_provider_count: market.activeProviderCount,
      verified_seller_count: market.verifiedSellerCount,
      private_seller_count: market.privateSellerCount,
      cheapest_rate_usd: market.cheapestRateUsd,
      settlement_asset: 'USDC',
      route: '/v1/inference/chat/completions',
    },
  };
}

function buildInferencePriceEntry(market: InferenceMarket) {
  return {
    modelId: market.modelId,
    modelProvider: market.modelProvider,
    cheapestRateUsd: market.cheapestRateUsd,
    declaredUnit: market.pricing.declaredUnit,
    pricePer1mInputTokensUsd: market.pricing.pricePer1mInputTokensUsd,
    pricePer1mOutputTokensUsd: market.pricing.pricePer1mOutputTokensUsd,
    providerCount: market.providerCount,
    activeProviderCount: market.activeProviderCount,
    verifiedSellerCount: market.verifiedSellerCount,
    privateSellerCount: market.privateSellerCount,
    recentSuccessRate: market.recentSuccessRate,
    p50LatencyMs: market.p50LatencyMs,
    p95LatencyMs: market.p95LatencyMs,
    sellers: market.sellers.map((seller) => ({
      sellerId: seller.sellerId,
      rateUsd: seller.rateUsd,
      pricing: seller.pricing,
      status: seller.status,
      verificationStatus: seller.verificationStatus,
    })),
  };
}

function buildPublicAuthMessage(nonce: string): string {
  return [
    'Boss Raid public beta sign-in',
    '',
    'Sign this message to create a wallet session. This does not authorize a transaction.',
    '',
    `Nonce: ${nonce}`,
  ].join('\n');
}

function readNonceFromAuthMessage(message: string): string | undefined {
  return message.match(/Nonce:\s*(nonce_[0-9a-f-]+)/i)?.[1];
}

function ensureRecordInput(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiContractError(`Expected object for ${label}.`);
  }
  return value as Record<string, unknown>;
}

function ensureOptionalRecordInput(
  value: unknown,
  label: string
): Record<string, unknown> | undefined {
  if (value == null) {
    return undefined;
  }
  return ensureRecordInput(value, label);
}

function ensureStringInput(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiContractError(`Expected non-empty string for ${label}.`);
  }
  return value.trim();
}

function ensureOptionalStringInput(value: unknown, label: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  return ensureStringInput(value, label);
}

function ensurePositiveNumberInput(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiContractError(`Expected positive number for ${label}.`);
  }
  return parsed;
}

function ensureOptionalStringArrayInput(value: unknown, label: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApiContractError(`Expected string array for ${label}.`);
  }
  return value;
}

function hashBuyerApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeBuyerApiKey(key: {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  spendLimitUsd?: number;
  spentUsd: number;
  status: string;
}) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    spendLimitUsd: key.spendLimitUsd,
    spentUsd: key.spentUsd,
    status: key.status,
  };
}

function enforceBuyerBudget(
  controlState: ApiControlState,
  auth:
    | { type: 'session'; wallet: string; token: string }
    | {
        type: 'api_key';
        wallet: string;
        apiKeyId: string;
        spendLimitUsd?: number;
        spentUsd: number;
      }
    | undefined,
  requestBudgetUsd: number,
  buyerMaxRequestBudgetUsd?: number
): { statusCode: number; error: string; message: string } | undefined {
  if (buyerMaxRequestBudgetUsd != null && requestBudgetUsd > buyerMaxRequestBudgetUsd) {
    return {
      statusCode: 402,
      error: 'budget_exceeds_limit',
      message: `Request budget exceeds the public beta max of $${buyerMaxRequestBudgetUsd.toFixed(
        2
      )}.`,
    };
  }

  if (auth?.type === 'api_key') {
    const account = controlState.readPublicAccount(auth.wallet);
    const spendCapOk =
      auth.spendLimitUsd == null || auth.spentUsd + requestBudgetUsd <= auth.spendLimitUsd;
    const balanceOk = account.balanceUsd >= requestBudgetUsd;
    if (!spendCapOk && !balanceOk) {
      return {
        statusCode: 402,
        error: 'api_key_spend_limit_exceeded',
        message: 'API key spend limit or prepaid balance would be exceeded by this request.',
      };
    }
  }

  return undefined;
}

function buildSelfServeProviderRegistrationInput(
  body: unknown,
  wallet: string,
  existing?: ProviderProfile
): Record<string, unknown> {
  const input = ensureRecordInput(body, 'seller_provider');
  const pricing = ensureOptionalRecordInput(input.pricing, 'seller_provider.pricing') ?? {};
  const payoutWallet =
    ensureOptionalStringInput(input.payoutWallet, 'seller_provider.payoutWallet') ??
    ensureOptionalStringInput(input.payout_wallet, 'seller_provider.payout_wallet') ??
    existing?.erc8004?.operatorWallet ??
    wallet;
  const erc8004Input = ensureOptionalRecordInput(input.erc8004, 'seller_provider.erc8004');
  const erc8004AgentId =
    erc8004Input == null
      ? existing?.erc8004?.agentId
      : (ensureOptionalStringInput(erc8004Input.agentId, 'seller_provider.erc8004.agentId') ??
        ensureOptionalStringInput(erc8004Input.agent_id, 'seller_provider.erc8004.agent_id') ??
        existing?.erc8004?.agentId);
  const agentId =
    ensureOptionalStringInput(input.agentId, 'seller_provider.agentId') ??
    ensureOptionalStringInput(input.agent_id, 'seller_provider.agent_id') ??
    existing?.agentId ??
    `seller-${wallet.slice(2, 8)}-${randomUUID().slice(0, 8)}`;
  const name =
    ensureOptionalStringInput(input.name, 'seller_provider.name') ??
    existing?.displayName ??
    `Seller ${agentId}`;
  const endpoint =
    ensureOptionalStringInput(input.endpoint, 'seller_provider.endpoint') ?? existing?.endpoint;

  if (!endpoint) {
    throw new ApiContractError('Expected non-empty string for seller_provider.endpoint.');
  }

  return {
    agentId,
    name,
    description:
      ensureOptionalStringInput(input.description, 'seller_provider.description') ??
      existing?.description,
    endpoint,
    capabilities: ensureOptionalStringArrayInput(
      input.capabilities,
      'seller_provider.capabilities'
    ) ??
      existing?.specializations ?? ['analysis', 'text'],
    supportedLanguages: ensureOptionalStringArrayInput(
      input.supportedLanguages ?? input.supported_languages,
      'seller_provider.supported_languages'
    ) ??
      existing?.supportedLanguages ?? ['text'],
    supportedFrameworks:
      ensureOptionalStringArrayInput(
        input.supportedFrameworks ?? input.supported_frameworks,
        'seller_provider.supported_frameworks'
      ) ??
      existing?.supportedFrameworks ??
      [],
    outputTypes: ensureOptionalStringArrayInput(
      input.outputTypes ?? input.output_types,
      'seller_provider.output_types'
    ) ??
      existing?.outputTypes ?? ['text', 'json'],
    agentFramework:
      input.agentFramework ?? input.agent_framework ?? existing?.agentFramework ?? 'custom',
    modelProvider: input.modelProvider ?? input.model_provider ?? existing?.modelProvider,
    modelId: input.modelId ?? input.model_id ?? existing?.modelId,
    modelFamily: input.modelFamily ?? input.model_family ?? existing?.modelFamily,
    maxConcurrency: input.maxConcurrency ?? input.max_concurrency ?? existing?.maxConcurrency ?? 1,
    pricing: {
      mode: pricing.mode ?? existing?.pricing?.mode,
      pricePerTaskUsd:
        pricing.pricePerTaskUsd ??
        pricing.price_per_task_usd ??
        input.pricePerTaskUsd ??
        input.price_per_task_usd ??
        existing?.pricing?.pricePerTaskUsd ??
        (pricing.mode === 'token_metered' || existing?.pricing?.mode === 'token_metered'
          ? undefined
          : (existing?.pricePerTaskUsd ?? 1)),
      pricePer1mInputTokensUsd:
        pricing.pricePer1mInputTokensUsd ??
        pricing.price_per_1m_input_tokens_usd ??
        existing?.pricing?.pricePer1mInputTokensUsd,
      pricePer1mOutputTokensUsd:
        pricing.pricePer1mOutputTokensUsd ??
        pricing.price_per_1m_output_tokens_usd ??
        existing?.pricing?.pricePer1mOutputTokensUsd,
      minimumChargeUsd:
        pricing.minimumChargeUsd ??
        pricing.minimum_charge_usd ??
        existing?.pricing?.minimumChargeUsd,
      currency: pricing.currency ?? existing?.pricing?.currency,
      validFrom: pricing.validFrom ?? pricing.valid_from ?? existing?.pricing?.validFrom,
      validUntil: pricing.validUntil ?? pricing.valid_until ?? existing?.pricing?.validUntil,
      rateCardVersion:
        pricing.rateCardVersion ?? pricing.rate_card_version ?? existing?.pricing?.rateCardVersion,
      rateCardHash:
        pricing.rateCardHash ?? pricing.rate_card_hash ?? existing?.pricing?.rateCardHash,
      upstreamModelId:
        pricing.upstreamModelId ?? pricing.upstream_model_id ?? existing?.pricing?.upstreamModelId,
      maxContextTokens:
        pricing.maxContextTokens ??
        pricing.max_context_tokens ??
        existing?.pricing?.maxContextTokens,
    },
    privacy: input.privacy ?? existing?.privacy ?? {},
    erc8004: erc8004AgentId
      ? {
          ...(existing?.erc8004 ?? {}),
          ...(erc8004Input ?? {}),
          agentId: erc8004AgentId,
          operatorWallet: payoutWallet,
        }
      : undefined,
    source: {
      type: 'self_serve',
      externalRef: wallet.toLowerCase(),
    },
    auth: input.auth ?? existing?.auth ?? { type: 'none' },
    verification: existing?.verification ?? { status: 'pending' },
    reputation: existing?.reputation,
    marketplaceOfferStatus:
      input.marketplaceOfferStatus ??
      input.marketplace_offer_status ??
      existing?.marketplaceOfferStatus ??
      'active',
  };
}

function buildPublicAccountResponse(controlState: ApiControlState, wallet: string) {
  const account = controlState.readPublicAccount(wallet);
  const purchases = controlState.listBuyerPurchases(wallet, 20);
  return {
    wallet: account.wallet,
    createdAt: account.createdAt,
    balanceUsd: account.balanceUsd,
    sellerProviderIds: account.sellerProviderIds,
    apiKeys: controlState.listBuyerApiKeys(wallet).map((key) => sanitizeBuyerApiKey(key)),
    recentPurchases: purchases,
    totalSavingsUsd: purchases.reduce((sum, entry) => sum + (entry.savingsUsd ?? 0), 0),
  };
}

function buildProviderVerificationFromHealth(
  provider: ProviderProfile,
  health: ProviderHealthStatus
): NonNullable<ProviderProfile['verification']> {
  const apiVerified = health.reachable === true && health.ready === true && !health.missing?.length;
  const frameworkVerified =
    provider.agentFramework == null || health.agentFramework === provider.agentFramework;
  const modelProviderVerified =
    provider.modelProvider == null || health.modelProvider === provider.modelProvider;
  const modelVerified = provider.modelId == null || health.model === provider.modelId;
  const verified = apiVerified && frameworkVerified && modelProviderVerified && modelVerified;
  const notes = [
    apiVerified ? 'health_ready' : 'health_not_ready',
    provider.agentFramework && health.agentFramework == null ? 'framework_not_reported' : null,
    provider.modelProvider && health.modelProvider == null ? 'model_provider_not_reported' : null,
    provider.modelId && health.model == null ? 'model_not_reported' : null,
    frameworkVerified ? null : 'framework_mismatch',
    modelProviderVerified ? null : 'model_provider_mismatch',
    modelVerified ? null : 'model_mismatch',
    health.error ? `health_error:${health.error}` : null,
  ].filter((note): note is string => Boolean(note));

  return {
    status: verified ? 'verified' : 'failed',
    checkedAt: new Date().toISOString(),
    apiVerified,
    frameworkVerified,
    modelVerified: modelProviderVerified && modelVerified,
    notes,
  };
}

function buildProviderVerificationRegistrationInput(
  provider: ProviderProfile,
  verification: NonNullable<ProviderProfile['verification']>
): ProviderRegistrationInput {
  return {
    agentId: provider.agentId ?? provider.providerId,
    name: provider.displayName,
    description: provider.description,
    endpoint: provider.endpoint,
    capabilities: provider.specializations,
    supportedLanguages: provider.supportedLanguages,
    supportedFrameworks: provider.supportedFrameworks,
    outputTypes: provider.outputTypes,
    modelFamily: provider.modelFamily,
    agentFramework: provider.agentFramework,
    modelProvider: provider.modelProvider,
    modelId: provider.modelId,
    maxConcurrency: provider.maxConcurrency,
    source: provider.source,
    privacy: provider.privacy,
    erc8004: provider.erc8004,
    trust: provider.trust,
    pricing: provider.pricing ?? {
      mode: 'task',
      currency: 'USD',
      pricePerTaskUsd: provider.pricePerTaskUsd,
    },
    auth: provider.auth,
    verification,
    reputation: provider.reputation,
  };
}

function readClientRateLimitKey(request: FastifyRequest): string {
  return request.ip;
}

function buildLaunchRequestKey(
  request: FastifyRequest,
  route: 'raid' | 'chat',
  input: BossRaidSpawnInput
): string {
  return createHash('sha256')
    .update(`${readClientRateLimitKey(request)}\n${route}\n${stableStringify(input)}`)
    .digest('hex');
}

function safeEqualString(left: string | undefined, right: string): boolean {
  if (typeof left !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookieHeader(header: string): Record<string, string> {
  const entries = header.split(';');
  const cookies: Record<string, string> = {};

  for (const entry of entries) {
    const [rawName, ...rawValue] = entry.trim().split('=');
    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join('='));
  }

  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    path?: string;
    maxAge?: number;
    secure?: boolean;
  }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readPositiveNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveChatTerminalSettleGraceMs(env: NodeJS.ProcessEnv): number {
  const inviteAcceptMs = readPositiveInteger(env.BOSSRAID_INVITE_ACCEPT_MS, 3_000);
  return Math.min(
    TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_CAP_MS,
    Math.max(TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_FLOOR_MS, inviteAcceptMs)
  );
}

function readBooleanEnv(value: string | undefined): boolean {
  return readBooleanEnvUtil(value);
}

function readMercenaryErc8004Identity(env: NodeJS.ProcessEnv): Erc8004Identity | undefined {
  const agentId = env.BOSSRAID_ERC8004_AGENT_ID?.trim();
  if (!agentId) {
    return undefined;
  }

  const validationTxs = env.BOSSRAID_ERC8004_VALIDATION_TXS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    agentId,
    operatorWallet: env.BOSSRAID_ERC8004_OPERATOR_WALLET?.trim() || undefined,
    registrationTx: env.BOSSRAID_ERC8004_REGISTRATION_TX?.trim() || undefined,
    identityRegistry: env.BOSSRAID_ERC8004_IDENTITY_REGISTRY?.trim() || undefined,
    reputationRegistry: env.BOSSRAID_ERC8004_REPUTATION_REGISTRY?.trim() || undefined,
    validationRegistry: env.BOSSRAID_ERC8004_VALIDATION_REGISTRY?.trim() || undefined,
    validationTxs: validationTxs && validationTxs.length > 0 ? validationTxs : undefined,
    lastVerifiedAt: env.BOSSRAID_ERC8004_LAST_VERIFIED_AT?.trim() || undefined,
  };
}

function readTeeSigner(env: NodeJS.ProcessEnv): {
  account: ReturnType<typeof mnemonicToAccount> | undefined;
  error: string | undefined;
} {
  const mnemonic = env.MNEMONIC?.trim();
  if (!mnemonic) {
    return {
      account: undefined,
      error: undefined,
    };
  }

  try {
    return {
      account: mnemonicToAccount(mnemonic),
      error: undefined,
    };
  } catch (error) {
    return {
      account: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildAttestedRuntimePayload(
  env: NodeJS.ProcessEnv,
  orchestrator: BossRaidOrchestrator,
  providerHealth: ProviderHealthStatus[],
  workerIsolation: 'per_job_process' | 'per_job_container'
): AttestedRuntimePayload {
  return {
    version: 1,
    nonce: randomUUID(),
    timestamp: new Date().toISOString(),
    deploymentTarget: env.BOSSRAID_DEPLOY_TARGET ?? null,
    teePlatform: env.BOSSRAID_TEE_PLATFORM ?? null,
    storageBackend: readStorageBackend(env),
    providers: orchestrator.listProviders().length,
    readyProviders: providerHealth.filter((provider) => provider.ready).length,
    raids: orchestrator.listRaids().length,
    evaluatorTransport: runtimeExecutionTransport(env),
    workerIsolation,
  };
}

function buildEvaluatorSmokeTask(): {
  task: SanitizedTaskSpec;
  files: TaskFile[];
  touchedFiles: string[];
} {
  const files = [
    createSmokeFile(
      'package.json',
      JSON.stringify(
        {
          name: 'bossraid-evaluator-smoke',
          private: true,
          type: 'module',
          scripts: {
            test: 'node --test',
          },
        },
        null,
        2
      )
    ),
    createSmokeFile('sum.js', ['export function sum(a, b) {', '  return a + b;', '}'].join('\n')),
    createSmokeFile(
      'sum.test.js',
      [
        'import assert from "node:assert/strict";',
        'import test from "node:test";',
        'import { sum } from "./sum.js";',
        '',
        'test("sum adds positive integers", () => {',
        '  assert.equal(sum(2, 3), 5);',
        '});',
      ].join('\n')
    ),
  ];

  return {
    task: {
      taskTitle: 'Evaluator smoke test',
      taskDescription:
        'Confirm the configured evaluator can execute an isolated Node built-in test suite.',
      language: 'text',
      framework: 'node',
      files,
      failingSignals: {
        errors: ['sum must return the correct arithmetic result.'],
        tests: ['node --test'],
        reproSteps: ['Run node --test in the workspace.'],
      },
      output: {
        primaryType: 'patch',
        artifactTypes: ['patch', 'text'],
      },
      constraints: {
        numExperts: 1,
        maxBudgetUsd: 1,
        maxLatencySec: 30,
        allowExternalSearch: false,
        requireSpecializations: ['node'],
        minReputation: 0,
        allowedOutputTypes: ['patch', 'text'],
        privacyMode: 'off',
      },
      rewardPolicy: {
        splitStrategy: 'equal_success_only',
      },
      privacyMode: {
        redactSecrets: false,
        redactIdentifiers: false,
        allowFullRepo: false,
      },
      hostContext: {
        host: 'codex',
      },
      originalFileCount: files.length,
      originalBytes: files.reduce(
        (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
        0
      ),
      sanitizationReport: {
        redactedSecrets: 0,
        redactedIdentifiers: 0,
        removedUrls: 0,
        trimmedFiles: 0,
        unsafeContentDetected: false,
        riskTier: 'safe',
        issues: [],
      },
    },
    files,
    touchedFiles: ['sum.js'],
  };
}

function createSmokeFile(path: string, content: string): TaskFile {
  return {
    path,
    content,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}

function buildAttestedRuntimeMessage(payload: AttestedRuntimePayload): string {
  return [
    'BossRaidAttestedRuntime',
    `version=${payload.version}`,
    `nonce=${payload.nonce}`,
    `timestamp=${payload.timestamp}`,
    `deploymentTarget=${payload.deploymentTarget ?? 'unknown'}`,
    `teePlatform=${payload.teePlatform ?? 'unknown'}`,
    `storageBackend=${payload.storageBackend}`,
    `providers=${payload.providers}`,
    `readyProviders=${payload.readyProviders}`,
    `raids=${payload.raids}`,
    `evaluatorTransport=${payload.evaluatorTransport}`,
    `workerIsolation=${payload.workerIsolation}`,
  ].join('|');
}

function buildAttestedRaidResultPayload(
  env: NodeJS.ProcessEnv,
  result: BossRaidResultOutput,
  workerIsolation: 'per_job_process' | 'per_job_container'
): AttestedRaidResultPayload {
  return {
    version: 1,
    nonce: randomUUID(),
    timestamp: new Date().toISOString(),
    deploymentTarget: env.BOSSRAID_DEPLOY_TARGET ?? null,
    teePlatform: env.BOSSRAID_TEE_PLATFORM ?? null,
    evaluatorTransport: runtimeExecutionTransport(env),
    workerIsolation,
    raidId: result.raidId,
    status: result.status,
    approvedSubmissionCount: result.approvedSubmissions?.length ?? 0,
    resultHash: hashAttestationText(stableStringify(result)),
    result,
  };
}

function buildAttestedRaidResultMessage(payload: AttestedRaidResultPayload): string {
  return [
    'BossRaidAttestedResult',
    `version=${payload.version}`,
    `nonce=${payload.nonce}`,
    `timestamp=${payload.timestamp}`,
    `deploymentTarget=${payload.deploymentTarget ?? 'unknown'}`,
    `teePlatform=${payload.teePlatform ?? 'unknown'}`,
    `evaluatorTransport=${payload.evaluatorTransport}`,
    `workerIsolation=${payload.workerIsolation}`,
    `raidId=${payload.raidId}`,
    `status=${payload.status}`,
    `approvedSubmissionCount=${payload.approvedSubmissionCount}`,
    `resultHash=${payload.resultHash}`,
  ].join('|');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)])
    );
  }

  return value;
}

function hashAttestationText(value: string): `0x${string}` {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

function readStorageBackend(env: NodeJS.ProcessEnv): 'sqlite' | 'file' | 'memory' {
  if (
    env.BOSSRAID_STORAGE_BACKEND === 'sqlite' ||
    env.BOSSRAID_STORAGE_BACKEND === 'file' ||
    env.BOSSRAID_STORAGE_BACKEND === 'memory'
  ) {
    return env.BOSSRAID_STORAGE_BACKEND;
  }

  return env.BOSSRAID_STATE_FILE ? 'file' : 'sqlite';
}

async function readTeeSocketState(
  path: string
): Promise<{ pathExists: boolean; socketMounted: boolean }> {
  try {
    const stats = await stat(path);
    return {
      pathExists: true,
      socketMounted: stats.isSocket(),
    };
  } catch {
    return {
      pathExists: false,
      socketMounted: false,
    };
  }
}

type ProductionReadinessStatus = 'pass' | 'warn' | 'fail';
type ProductionReadinessSeverity = 'blocking' | 'warning' | 'info';

interface ProductionReadinessCheck {
  id: string;
  status: ProductionReadinessStatus;
  severity: ProductionReadinessSeverity;
  message: string;
  details?: Record<string, unknown>;
}

function buildProductionReadinessReport(input: {
  env: NodeJS.ProcessEnv;
  storageBackend: 'sqlite' | 'file' | 'memory';
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
    status:
      input.storageBackend === 'memory' || !input.persistenceHealthy
        ? 'fail'
        : input.storageBackend === 'sqlite'
          ? 'warn'
          : 'warn',
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

function hasStrongOperationalSecret(value: string | undefined, minLength = 32): boolean {
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

type ApiMetricsRouteStats = {
  count: number;
  errorCount: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
};

function createApiMetrics() {
  const startedAt = new Date().toISOString();
  const counters = new Map<string, number>();
  const routes = new Map<string, ApiMetricsRouteStats>();

  return {
    increment(name: string, value = 1) {
      counters.set(name, (counters.get(name) ?? 0) + value);
    },
    recordHttp(input: { method: string; route: string; statusCode: number; durationMs: number }) {
      const key = `${input.method.toUpperCase()} ${input.route}`;
      const current =
        routes.get(key) ??
        ({
          count: 0,
          errorCount: 0,
          totalLatencyMs: 0,
          maxLatencyMs: 0,
        } satisfies ApiMetricsRouteStats);
      current.count += 1;
      current.errorCount += input.statusCode >= 500 ? 1 : 0;
      current.totalLatencyMs += input.durationMs;
      current.maxLatencyMs = Math.max(current.maxLatencyMs, input.durationMs);
      routes.set(key, current);
      counters.set('http.requests_total', (counters.get('http.requests_total') ?? 0) + 1);
      if (input.statusCode >= 400) {
        counters.set('http.errors_total', (counters.get('http.errors_total') ?? 0) + 1);
      }
    },
    snapshot() {
      return {
        startedAt,
        generatedAt: new Date().toISOString(),
        counters: Object.fromEntries(
          [...counters.entries()].sort(([left], [right]) => left.localeCompare(right))
        ),
        routes: Object.fromEntries(
          [...routes.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([route, stats]) => [
              route,
              {
                ...stats,
                averageLatencyMs: stats.count > 0 ? stats.totalLatencyMs / stats.count : 0,
              },
            ])
        ),
      };
    },
    toPrometheus() {
      const lines = [
        '# HELP bossraid_http_requests_total Total HTTP requests observed by Boss Raid.',
        '# TYPE bossraid_http_requests_total counter',
      ];
      for (const [route, stats] of [...routes.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        const [method, ...routeParts] = route.split(' ');
        lines.push(
          `bossraid_http_requests_total{method="${escapeMetricLabel(method)}",route="${escapeMetricLabel(
            routeParts.join(' ')
          )}"} ${stats.count}`
        );
      }

      lines.push(
        '# HELP bossraid_http_request_latency_ms_sum Total HTTP request latency in milliseconds.',
        '# TYPE bossraid_http_request_latency_ms_sum counter'
      );
      for (const [route, stats] of [...routes.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        const [method, ...routeParts] = route.split(' ');
        lines.push(
          `bossraid_http_request_latency_ms_sum{method="${escapeMetricLabel(
            method
          )}",route="${escapeMetricLabel(routeParts.join(' '))}"} ${stats.totalLatencyMs}`
        );
      }

      lines.push(
        '# HELP bossraid_events_total Total named Boss Raid application events.',
        '# TYPE bossraid_events_total counter'
      );
      for (const [name, value] of [...counters.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        lines.push(`bossraid_events_total{name="${escapeMetricLabel(name)}"} ${value}`);
      }
      return `${lines.join('\n')}\n`;
    },
  };
}

function escapeMetricLabel(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\n/gu, '\\n');
}

function parseOpsSessionInput(value: unknown): { token: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiContractError('Expected object for ops_session.');
  }

  const token = (value as Record<string, unknown>).token;
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new ApiContractError('Expected non-empty string for ops_session.token.');
  }

  return {
    token: token.trim(),
  };
}

function buildChatCompletionResponse(
  chatRequest: ChatCompletionRequest,
  spawn: {
    raidId: string;
    raidAccessToken: string;
    receiptPath: string;
    selectedExperts: number;
  },
  outcome: {
    status: BossRaidStatusOutput;
    result: BossRaidResultOutput;
  },
  created: number
) {
  const content = buildUserFacingChatContent(spawn.raidId, outcome, chatRequest);

  return {
    id: `chatcmpl_${spawn.raidId}`,
    object: 'chat.completion',
    created,
    model: normalizeChatCompletionModel(chatRequest.model),
    system_fingerprint: 'mercenary-v1',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    raid: buildChatRaidMetadata(spawn, outcome),
    usage: estimateChatUsage(chatRequest.messages, content),
  };
}

function buildDirectChatCompletionResponse(chatRequest: ChatCompletionRequest, created: number) {
  if (chatRequest.raidRequest) {
    return null;
  }

  const prompt = selectPrimaryChatPrompt(chatRequest);
  if (!isLowSignalChatPrompt(prompt)) {
    return null;
  }

  const content = buildDirectMercenaryChatReply(prompt);

  return {
    id: `chatcmpl_${randomUUID()}`,
    object: 'chat.completion',
    created,
    model: normalizeChatCompletionModel(chatRequest.model),
    system_fingerprint: 'mercenary-v1',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: estimateChatUsage(chatRequest.messages, content),
  };
}

// Using constants from @bossraid/constants

async function streamDirectChatCompletionResponse(
  reply: FastifyReply,
  response: NonNullable<ReturnType<typeof buildDirectChatCompletionResponse>>
) {
  const stream = new PassThrough();
  reply.code(200);
  reply.header('content-type', 'text/event-stream; charset=utf-8');
  reply.header('cache-control', 'no-cache, no-transform');
  reply.header('connection', 'keep-alive');
  reply.header('x-accel-buffering', 'no');
  void (async () => {
    try {
      writeSseData(stream, {
        id: response.id,
        object: 'chat.completion.chunk',
        created: response.created,
        model: response.model,
        system_fingerprint: response.system_fingerprint,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
            },
            finish_reason: null,
          },
        ],
      });

      writeSseData(stream, {
        id: response.id,
        object: 'chat.completion.chunk',
        created: response.created,
        model: response.model,
        system_fingerprint: response.system_fingerprint,
        choices: [
          {
            index: 0,
            delta: {
              content: response.choices[0]?.message.content ?? '',
            },
            finish_reason: null,
          },
        ],
      });

      writeSseData(stream, {
        id: response.id,
        object: 'chat.completion.chunk',
        created: response.created,
        model: response.model,
        system_fingerprint: response.system_fingerprint,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      });
      stream.write('data: [DONE]\n\n');
    } finally {
      stream.end();
    }
  })();

  return reply.send(stream);
}

async function streamChatCompletionResponse(
  reply: FastifyReply,
  orchestrator: BossRaidOrchestrator,
  input: {
    chatRequest: ChatCompletionRequest;
    raidRequest: BossRaidSpawnInput;
    spawn: {
      raidId: string;
      raidAccessToken: string;
      receiptPath: string;
      selectedExperts: number;
    };
    created: number;
    settleGraceMs: number;
    bossraidBilling?: {
      capture: (
        usage: ReturnType<typeof estimateChatUsage>,
        selectedSeller?: string
      ) => Promise<unknown>;
    };
  }
) {
  const stream = new PassThrough();
  reply.code(200);
  reply.header('content-type', 'text/event-stream; charset=utf-8');
  reply.header('cache-control', 'no-cache, no-transform');
  reply.header('connection', 'keep-alive');
  reply.header('x-accel-buffering', 'no');
  void (async () => {
    try {
      writeSseData(stream, {
        id: `chatcmpl_${input.spawn.raidId}`,
        object: 'chat.completion.chunk',
        created: input.created,
        model: normalizeChatCompletionModel(input.chatRequest.model),
        system_fingerprint: 'mercenary-v1',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
            },
            finish_reason: null,
          },
        ],
        raid: buildChatRaidMetadata(input.spawn),
      });

      const deadline =
        Date.now() + Math.max(input.raidRequest.constraints.maxLatencySec * 1000, 1_000);
      const settleDeadline = deadline + input.settleGraceMs;
      let lastKeepAliveAt = Date.now();
      let outcome = {
        status: orchestrator.getStatus(input.spawn.raidId),
        result: orchestrator.getResult(input.spawn.raidId),
      };

      while (Date.now() < settleDeadline) {
        outcome = {
          status: orchestrator.getStatus(input.spawn.raidId),
          result: orchestrator.getResult(input.spawn.raidId),
        };
        if (isTerminalChatOutcome(outcome)) {
          break;
        }

        if (Date.now() - lastKeepAliveAt >= DEFAULTS.PROVIDER_HEALTH_TIMEOUT_MS) {
          stream.write(': keep-alive\n\n');
          lastKeepAliveAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const finalOutcome = isTerminalChatOutcome(outcome)
        ? outcome
        : {
            status: orchestrator.getStatus(input.spawn.raidId),
            result: orchestrator.getResult(input.spawn.raidId),
          };
      const content = buildUserFacingChatContent(
        input.spawn.raidId,
        finalOutcome,
        input.chatRequest
      );
      const usage = estimateChatUsage(input.chatRequest.messages, content);
      const selectedSeller =
        finalOutcome.result.synthesizedOutput?.baseSubmissionProviderId ??
        finalOutcome.result.approvedSubmissions?.[0]?.submission.providerId;
      let bossraid: unknown;
      try {
        bossraid = await input.bossraidBilling?.capture(usage, selectedSeller);
      } catch (error) {
        logger.error({ error, raidId: input.spawn.raidId }, 'Mana billing capture failed.');
      }

      if (content.length > 0) {
        writeSseData(stream, {
          id: `chatcmpl_${input.spawn.raidId}`,
          object: 'chat.completion.chunk',
          created: input.created,
          model: normalizeChatCompletionModel(input.chatRequest.model),
          system_fingerprint: 'mercenary-v1',
          choices: [
            {
              index: 0,
              delta: {
                content,
              },
              finish_reason: null,
            },
          ],
          raid: buildChatRaidMetadata(input.spawn, finalOutcome),
          bossraid,
        });
      }

      writeSseData(stream, {
        id: `chatcmpl_${input.spawn.raidId}`,
        object: 'chat.completion.chunk',
        created: input.created,
        model: normalizeChatCompletionModel(input.chatRequest.model),
        system_fingerprint: 'mercenary-v1',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
        raid: buildChatRaidMetadata(input.spawn, finalOutcome),
        bossraid,
        usage,
      });
      stream.write('data: [DONE]\n\n');
    } finally {
      stream.end();
    }
  })();

  return reply.send(stream);
}

function buildChatRaidMetadata(
  spawn: {
    raidId: string;
    raidAccessToken: string;
    receiptPath: string;
    selectedExperts: number;
  },
  outcome?: {
    status: BossRaidStatusOutput;
    result: BossRaidResultOutput;
  }
) {
  const approved = outcome?.result.approvedSubmissions ?? [];
  const synthesized = outcome?.result.synthesizedOutput;

  return {
    raid_id: spawn.raidId,
    raid_access_token: spawn.raidAccessToken,
    receipt_path: spawn.receiptPath,
    agents_invited: spawn.selectedExperts,
    agents_succeeded: synthesized?.contributingProviderIds.length ?? approved.length,
    successful_agents: approved.map((entry) => entry.submission.providerId),
    synthesized_from_agents: synthesized?.contributingProviderIds,
    base_agent: synthesized?.baseSubmissionProviderId,
    status: outcome?.status.status,
  };
}

function buildUserFacingChatContent(
  raidId: string,
  outcome: {
    status: BossRaidStatusOutput;
    result: BossRaidResultOutput;
  },
  chatRequest?: ChatCompletionRequest
): string {
  const synthesized = outcome.result.synthesizedOutput;
  const primary = outcome.result.primarySubmission;
  const fallback = buildChatCompletionFallback(raidId, outcome.status.status, chatRequest);

  return (
    synthesized?.answerText ??
    synthesized?.explanation ??
    primary?.submission.answerText ??
    primary?.submission.explanation ??
    fallback
  );
}

function buildChatCompletionFallback(
  raidId: string,
  status: BossRaidStatusOutput['status'],
  chatRequest?: ChatCompletionRequest
): string {
  const prompt = selectPrimaryChatPrompt(chatRequest);

  if (isLowSignalChatPrompt(prompt)) {
    return buildDirectMercenaryChatReply(prompt);
  }

  if (status === 'final') {
    return 'Mercenary did not get an approved specialist answer for this run. Rephrase the request more concretely, or use raid chat if you want a scoped build workflow.';
  }

  return `Mercenary opened raid ${raidId} and is still waiting for approved specialist output.`;
}

function selectPrimaryChatPrompt(chatRequest?: ChatCompletionRequest): string {
  if (!chatRequest) {
    return '';
  }

  const userMessages = chatRequest.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter((message) => message.length > 0);

  return userMessages[userMessages.length - 1] ?? '';
}

function buildDirectMercenaryChatReply(prompt: string): string {
  const normalizedPrompt = prompt.trim().toLowerCase();

  if (/^who are you\b/.test(normalizedPrompt)) {
    return 'I’m Mercenary, the Boss Raid orchestrator. I can answer directly for simple questions, or open specialists when you need scoped work.';
  }

  if (/^what can you do\b/.test(normalizedPrompt)) {
    return 'I can answer directly, compare options, and open specialists for code, art, gameplay, or promo work when the request needs real execution.';
  }

  if (isDirectJokePrompt(normalizedPrompt)) {
    return 'Why did the programmer go broke? Because he used up all his cache.';
  }

  return 'Mercenary here. Ask a question or give me a concrete task and I’ll answer directly or open specialists when it helps.';
}

function isLowSignalChatPrompt(prompt: string): boolean {
  const normalizedPrompt = prompt.trim().toLowerCase();
  if (normalizedPrompt.length === 0) {
    return false;
  }

  return (
    /^(hi|hello|hey|yo|sup|hiya|howdy)\b/.test(normalizedPrompt) ||
    /^what'?s up\b/.test(normalizedPrompt) ||
    /^who are you\b/.test(normalizedPrompt) ||
    /^what can you do\b/.test(normalizedPrompt) ||
    isDirectJokePrompt(normalizedPrompt)
  );
}

function isDirectJokePrompt(normalizedPrompt: string): boolean {
  return (
    /^tell me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(normalizedPrompt) ||
    /^can you tell me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(
      normalizedPrompt
    ) ||
    /^give me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(normalizedPrompt) ||
    /^share (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(normalizedPrompt) ||
    /^(another|one more|a better|a funnier|a new) joke\b/.test(normalizedPrompt) ||
    /^make me laugh\b/.test(normalizedPrompt) ||
    /^say something funny\b/.test(normalizedPrompt)
  );
}

function normalizeChatCompletionModel(_model: string): string {
  return 'mercenary-v1';
}

function estimateChatUsage(messages: ChatCompletionRequest['messages'], content: string) {
  const promptTokens = messages.reduce(
    (total, message) => total + estimateTokenCount(message.content),
    0
  );
  const completionTokens = estimateTokenCount(content);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function estimateTokenCount(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function writeSseData(stream: PassThrough, payload: unknown): void {
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isTerminalChatOutcome(outcome: {
  status: BossRaidStatusOutput;
  result: BossRaidResultOutput;
}): boolean {
  return ['final', 'cancelled', 'expired'].includes(outcome.status.status);
}

async function waitForTerminalRaidOutput(
  orchestrator: BossRaidOrchestrator,
  raidId: string,
  timeoutMs: number,
  settleGraceMs: number
) {
  const deadline = Date.now() + Math.max(timeoutMs, 1_000);
  const settleDeadline =
    deadline + Math.max(settleGraceMs, TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_FLOOR_MS);
  let latest = {
    status: orchestrator.getStatus(raidId),
    result: orchestrator.getResult(raidId),
  };

  while (Date.now() < settleDeadline) {
    latest = {
      status: orchestrator.getStatus(raidId),
      result: orchestrator.getResult(raidId),
    };
    if (isTerminalChatOutcome(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return latest;
}

import { NETWORK } from '@bossraid/constants';

async function main() {
  const orchestrator = await createDefaultOrchestrator(runtimeOptionsFromEnv());
  const app = buildApiServer(orchestrator);
  const port = Number(process.env.PORT || NETWORK.LOCAL_API_PORT.toString());
  const host = process.env.BOSSRAID_API_HOST ?? process.env.HOST ?? NETWORK.LOCALHOST;
  await app.listen({ port, host });
  logger.info(`Boss Raid API listening on http://${host}:${port}`);
  registerShutdownHandlers(async () => {
    await app.close();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error(error);
    process.exit(1);
  });
}

function registerShutdownHandlers(closeServer: () => Promise<void>): void {
  let closing = false;

  const shutdown = async (signal: string) => {
    if (closing) {
      return;
    }
    closing = true;
    logger.info(`Shutting down Boss Raid API after ${signal}`);
    try {
      await closeServer();
      process.exit(0);
    } catch (error) {
      logger.error(error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
