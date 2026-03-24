import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { stat } from "node:fs/promises";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { mnemonicToAccount } from "viem/accounts";
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
} from "@bossraid/api-contracts";
import {
  type BossRaidOrchestrator,
  createDefaultOrchestrator,
  InvalidRaidLaunchReservationError,
  NoEligibleProvidersError,
  runtimeOptionsFromEnv,
  UnknownRaidError,
} from "@bossraid/orchestrator";
import { probeProviderHealth, verifyProviderAuth } from "@bossraid/provider-sdk";
import {
  type BossRaidResultOutput,
  type BossRaidSpawnInput,
  type Erc8004Identity,
  type ProviderHealthStatus,
  type ProviderProfile,
  type SanitizedTaskSpec,
  type TaskFile,
} from "@bossraid/shared-types";
import {
  cleanupWorkspace,
  materializeWorkspace,
  runRuntimeProbes,
  runtimeExecutionEnabled,
  runtimeExecutionTransport,
  unsafeHostExecutionAllowed,
} from "@bossraid/sandbox-runner";
import {
  applyX402Headers,
  buildX402PaymentRequired,
  isX402ProtocolError,
  readX402Config,
  readX402ReservationId,
  requireX402Payment,
} from "./x402.js";
import { buildAgentLog, buildAgentManifest } from "./agent-artifacts.js";
import { createErc8004Verifier } from "./erc8004.js";
import {
  createSettlementProofRefresher,
  persistSettlementExecutionArtifact,
  settlementExecutionChanged,
} from "./settlement-proof.js";

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
  workerIsolation: "per_job_process" | "per_job_container";
}

interface AttestedRaidResultPayload {
  version: 1;
  nonce: string;
  timestamp: string;
  deploymentTarget: string | null;
  teePlatform: string | null;
  evaluatorTransport: string;
  workerIsolation: "per_job_process" | "per_job_container";
  raidId: string;
  status: BossRaidResultOutput["status"];
  approvedSubmissionCount: number;
  resultHash: `0x${string}`;
  result: BossRaidResultOutput;
}

export function buildApiServer(
  orchestrator: BossRaidOrchestrator,
  env: NodeJS.ProcessEnv = process.env,
) {
  const adminToken = env.BOSSRAID_ADMIN_TOKEN;
  const demoRouteEnabled = readBooleanEnv(env.BOSSRAID_DEMO_ROUTE_ENABLED);
  const demoToken = env.BOSSRAID_DEMO_TOKEN?.trim() || undefined;
  const apiBodyLimitBytes = readPositiveInteger(env.BOSSRAID_API_BODY_LIMIT_BYTES, 524_288);
  const providerSubmissionBodyLimitBytes = Math.max(apiBodyLimitBytes, 8 * 1024 * 1024);
  const opsSessionTtlSec = readPositiveInteger(env.BOSSRAID_OPS_SESSION_TTL_SEC, 43_200);
  const publicRateLimitMax = readPositiveInteger(env.BOSSRAID_PUBLIC_RATE_LIMIT_MAX, 60);
  const publicRateLimitWindowMs = readPositiveInteger(env.BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS, 60_000);
  const opsSessionRateLimitMax = readPositiveInteger(env.BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX, 10);
  const opsSessionRateLimitWindowMs = readPositiveInteger(
    env.BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS,
    300_000,
  );
  const providerHealthTimeoutMs = readPositiveInteger(env.BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS, 5_000);
  const evaluatorMaxConcurrentJobs = readPositiveInteger(env.BOSSRAID_EVAL_MAX_CONCURRENT_JOBS, 2);
  const registryToken = env.BOSSRAID_REGISTRY_TOKEN;
  let mercenaryIdentity = readMercenaryErc8004Identity(env);
  const trustProxy =
    env.BOSSRAID_TRUST_PROXY === "1" ||
    env.BOSSRAID_TRUST_PROXY === "true" ||
    env.BOSSRAID_TRUST_PROXY === "yes";
  const teeSigner = readTeeSigner(env);
  const app = Fastify({
    logger: false,
    bodyLimit: apiBodyLimitBytes,
    trustProxy,
  });
  const erc8004Verifier = createErc8004Verifier(env);
  const settlementProofRefresher = createSettlementProofRefresher(env);
  const opsSessions = new Map<string, number>();
  const rateLimits = new Map<string, { count: number; resetAt: number }>();
  const workerIsolation = env.BOSSRAID_EVAL_JOB_ISOLATION === "container" ? "per_job_container" : "per_job_process";

  app.setErrorHandler((error, _request, reply) => {
    if (isX402ProtocolError(error)) {
      const reservationId = error.paymentRequired.accepts[0]?.extra?.reservationId;
      if (typeof reservationId === "string") {
        reply.header("X-BOSSRAID-LAUNCH-RESERVATION", reservationId);
      }
      applyX402Headers(reply, {
        paymentRequired: error.paymentRequired,
        settlement: error.settlement,
      });
      reply.code(error.statusCode).send({
        error: "payment_required",
        message: error.message,
        x402: error.paymentRequired,
        settlement: error.settlement,
      });
      return;
    }

    if (error instanceof ApiContractError) {
      reply.code(error.statusCode).send({
        error: "bad_request",
        message: error.message,
      });
      return;
    }

    if (error instanceof NoEligibleProvidersError) {
      reply.code(409).send({
        error: "no_eligible_providers",
        message: error.message,
      });
      return;
    }

    if (error instanceof UnknownRaidError) {
      reply.code(404).send({
        error: "not_found",
        message: error.message,
      });
      return;
    }

    if (error instanceof InvalidRaidLaunchReservationError) {
      reply.code(409).send({
        error: "invalid_launch_reservation",
        message: error.message,
      });
      return;
    }

    console.error(error);
    reply.code(500).send({
      error: "internal_error",
      message: "Internal server error.",
    });
  });

  function providerIsAuthorized(
    providerId: string,
    request: {
      method: string;
      path: string;
      body: unknown;
      headers: Record<string, string | string[] | undefined>;
    },
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
      body: JSON.stringify(request.body ?? {}),
      headers: request.headers,
      authorizationHeader: asSingleHeader(request.headers.authorization),
      timestampHeader: asSingleHeader(request.headers["x-bossraid-timestamp"]),
      signatureHeader: asSingleHeader(request.headers["x-bossraid-signature"]),
      providerIdHeader: asSingleHeader(request.headers["x-bossraid-provider-id"]),
    });
  }

  function registryIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (!registryToken) {
      return false;
    }

    return asSingleHeader(headers.authorization) === `Bearer ${registryToken}`;
  }

  function adminIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (adminToken && safeEqualString(asSingleHeader(headers.authorization), `Bearer ${adminToken}`)) {
      return true;
    }

    const session = readOpsSession(headers);
    return session != null;
  }

  function requireAdmin(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>,
  ): { error: string; message?: string } | undefined {
    if (!adminToken) {
      reply.code(503);
      return {
        error: "admin_auth_not_configured",
        message: "BOSSRAID_ADMIN_TOKEN is required for this route.",
      };
    }

    if (!adminIsAuthorized(headers)) {
      reply.code(401);
      return { error: "unauthorized" };
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

    return safeEqualString(asSingleHeader(headers["x-bossraid-demo-token"]), demoToken);
  }

  function requireDemoRouteAccess(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>,
  ): { error: string; message?: string } | undefined {
    if (!demoRouteEnabled) {
      reply.code(404);
      return {
        error: "not_found",
        message: "Demo raid route is not enabled.",
      };
    }

    if (!demoRouteIsAuthorized(headers)) {
      reply.code(401);
      return {
        error: "unauthorized",
        message: "Demo raid route requires a valid x-bossraid-demo-token header.",
      };
    }

    return undefined;
  }

  function consumeRateLimit(
    bucket: string,
    key: string,
    maxRequests: number,
    windowMs: number,
  ): { allowed: true } | { allowed: false; retryAfterSec: number } {
    pruneExpiredRateLimits();
    const nowMs = Date.now();
    const entryKey = `${bucket}:${key}`;
    const current = rateLimits.get(entryKey);

    if (!current || current.resetAt <= nowMs) {
      rateLimits.set(entryKey, {
        count: 1,
        resetAt: nowMs + windowMs,
      });
      return { allowed: true };
    }

    if (current.count >= maxRequests) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1_000)),
      };
    }

    current.count += 1;
    rateLimits.set(entryKey, current);
    return { allowed: true };
  }

  function requireRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
    bucket: string,
    maxRequests: number,
    windowMs: number,
  ): { error: string; message: string } | undefined {
    if (maxRequests <= 0) {
      return undefined;
    }

    const result = consumeRateLimit(
      bucket,
      readClientRateLimitKey(request),
      maxRequests,
      windowMs,
    );
    if (result.allowed) {
      return undefined;
    }

    reply
      .code(429)
      .header("retry-after", String(result.retryAfterSec));
    return {
      error: "rate_limited",
      message: "Too many requests. Retry later.",
    };
  }

  function requireRaidReadAccess(
    reply: FastifyReply,
    raidId: string,
    headers: Record<string, string | string[] | undefined>,
    queryAccessToken?: string,
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
      return { error: "unauthorized" };
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
    options: { includeEndpoint?: boolean } = {},
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
      pricePerTaskUsd: provider.pricePerTaskUsd,
      maxConcurrency: provider.maxConcurrency,
      status: provider.status,
      modelFamily: provider.modelFamily,
      outputTypes: provider.outputTypes,
      privacy: provider.privacy,
      erc8004: provider.erc8004,
      trust: provider.trust,
      reputation: provider.reputation,
      scores: provider.scores,
      lastSeenAt: provider.lastSeenAt,
    };
  }

  async function ensureErc8004ProofState(options: {
    includeMercenary?: boolean;
    providers?: ProviderProfile[];
  } = {}): Promise<void> {
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
      console.error("Mercenary settlement artifact sync error", error);
    }
  }

  function serializeProviderHealth(
    health: ProviderHealthStatus,
    options: { includeDiagnostics?: boolean; includeEndpoint?: boolean } = {},
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

  function readOpsSession(
    headers: Record<string, string | string[] | undefined>,
  ): { token: string; expiresAt: number } | undefined {
    pruneExpiredOpsSessions();
    const cookieHeader = asSingleHeader(headers.cookie);
    if (!cookieHeader) {
      return undefined;
    }

    const token = parseCookieHeader(cookieHeader)[OPS_SESSION_COOKIE_NAME];
    if (!token) {
      return undefined;
    }

    const expiresAt = opsSessions.get(token);
    if (expiresAt == null || expiresAt <= Date.now()) {
      opsSessions.delete(token);
      return undefined;
    }

    return { token, expiresAt };
  }

  function issueOpsSession(reply: FastifyReply): { expiresAt: number } {
    pruneExpiredOpsSessions();
    const token = `ops_${randomUUID()}`;
    const expiresAt = Date.now() + opsSessionTtlSec * 1_000;
    opsSessions.set(token, expiresAt);
    reply.header(
      "set-cookie",
      serializeCookie(OPS_SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/ops-api",
        maxAge: opsSessionTtlSec,
        secure: env.NODE_ENV === "production",
      }),
    );
    return { expiresAt };
  }

  function clearOpsSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const session = readOpsSession(headers);
    if (session) {
      opsSessions.delete(session.token);
    }
    reply.header(
      "set-cookie",
      serializeCookie(OPS_SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "Strict",
        path: "/ops-api",
        maxAge: 0,
        secure: env.NODE_ENV === "production",
      }),
    );
  }

  function pruneExpiredOpsSessions(nowMs: number = Date.now()): void {
    for (const [token, expiresAt] of opsSessions.entries()) {
      if (expiresAt <= nowMs) {
        opsSessions.delete(token);
      }
    }
  }

  function pruneExpiredRateLimits(nowMs: number = Date.now()): void {
    for (const [key, entry] of rateLimits.entries()) {
      if (entry.resetAt <= nowMs) {
        rateLimits.delete(key);
      }
    }
  }

  function validateProviderCallback(
    raidId: string,
    providerId: string,
    providerRunId?: string,
  ):
    | { ok: true }
    | { ok: false; statusCode: number; body: { error: string; message: string } } {
    const raid = orchestrator.getRaid(raidId);
    if (!raid) {
      return {
        ok: false,
        statusCode: 404,
        body: {
          error: "not_found",
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
          error: "provider_not_assigned",
          message: `Provider ${providerId} is not assigned to raid ${raidId}.`,
        },
      };
    }

    if (!assignment.providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: "provider_run_not_ready",
          message: `Provider ${providerId} has not accepted raid ${raidId} yet.`,
        },
      };
    }

    if (!providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: "provider_run_required",
          message: `Provider ${providerId} must include providerRunId for raid ${raidId}.`,
        },
      };
    }

    if (assignment.providerRunId !== providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: "provider_run_mismatch",
          message: `Provider run ${providerRunId} does not match the active assignment for raid ${raidId}.`,
        },
      };
    }

    return { ok: true };
  }

  function getRaidId(request: { params: unknown }): string {
    return (request.params as { raidId: string }).raidId;
  }

  async function requireReservedLaunchPayment(
    route: "raid" | "chat",
    request: FastifyRequest,
    input: BossRaidSpawnInput,
  ): Promise<{
    settlement?: import("./x402.js").X402SettlementResponse;
    reservationId?: string;
    requestKey?: string;
  }> {
    const x402Config = readX402Config(env);
    if (!x402Config.enabled) {
      return {};
    }

    const requestKey = buildLaunchRequestKey(request, route, input);
    const paymentSignature = asSingleHeader(request.headers["payment-signature"]);
    const explicitReservationId = readX402ReservationId(request.headers);
    if (paymentSignature && !explicitReservationId) {
      throw new ApiContractError(
        "Paid requests must include X-BossRaid-Launch-Reservation from the payment challenge.",
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
        "Raid launch reservation is missing, expired, or does not match this request.",
      );
    }
    if (reservation.route !== route) {
      throw new InvalidRaidLaunchReservationError(
        `Raid launch reservation ${reservation.id} was created for /v1/${reservation.route}, not ${route}.`,
      );
    }

    const remainingTimeoutSec = Math.max(1, Math.ceil((Date.parse(reservation.expiresAt) - Date.now()) / 1_000));
    const paymentRequired = buildX402PaymentRequired({
      route,
      env,
      budgetUsd: reservation.sanitized.constraints.maxBudgetUsd,
      extra: {
        reservationId: reservation.id,
      },
      maxTimeoutSeconds: remainingTimeoutSec,
    });

    const payment = await requireX402Payment({
      route,
      headers: request.headers,
      env,
      budgetUsd: reservation.sanitized.constraints.maxBudgetUsd,
      paymentRequired,
    });

    return {
      settlement: payment.settlement,
      reservationId: reservation.id,
      requestKey,
    };
  }

  async function spawnParsedRaid(
    request: FastifyRequest,
    reply: FastifyReply,
    parseInput: (value: unknown) => BossRaidSpawnInput,
    options: {
      requirePayment?: boolean;
    } = {},
  ) {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      "public-action",
      publicRateLimitMax,
      publicRateLimitWindowMs,
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const input = parseInput(request.body);
    await ensureErc8004ProofState({ includeMercenary: false });
    const payment = options.requirePayment === false ? {} : await requireReservedLaunchPayment("raid", request, input);
    const response =
      payment.reservationId && payment.requestKey
        ? await orchestrator.spawnReservedRaid(payment.reservationId, payment.requestKey)
        : await orchestrator.spawnRaid(input);
    applyX402Headers(reply, {
      settlement: payment.settlement,
    });
    return response;
  }

  function registerRaidRoutes(basePath: "/v1/raid" | "/v1/raids"): void {
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
      return orchestrator.getResult(raidId);
    });

    app.get(`${basePath}/:raidId/agent_log.json`, async (request, reply) => {
      const raidId = getRaidId(request);
      const queryAccessToken = readRaidAccessTokenQuery(request.query);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers, queryAccessToken);
      if (authorizationError) {
        return authorizationError;
      }

      const raid = orchestrator.getRaid(raidId);
      if (!raid) {
        reply.code(404);
        return {
          error: "not_found",
          message: `Unknown raid: ${raidId}`,
        };
      }

      reply.header("cache-control", "private, no-store");
      await ensureSettlementProofState(raidId);
      await ensureErc8004ProofState({ includeMercenary: false });
      return buildAgentLog(raid, {
        getRaid: (currentRaidId) => orchestrator.getRaid(currentRaidId),
        getProvider: (providerId) => orchestrator.getProviderProfile(providerId),
        raidAccessToken:
          asSingleHeader(request.headers[RAID_ACCESS_TOKEN_HEADER]) ??
          queryAccessToken,
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
          error: "tee_signer_not_configured",
          message: teeSigner.error ?? "MNEMONIC environment variable is required for attested raid result proofs.",
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
    return Promise.all(orchestrator.listProviders().map((provider) => probeProviderHealth(provider)));
  }

  app.get("/health", async () => {
    const providerHealth = await collectProviderHealth();

    return {
      ok: providerHealth.length > 0 && providerHealth.every((provider) => provider.ready),
      providers: orchestrator.listProviders().length,
      readyProviders: providerHealth.filter((provider) => provider.ready).length,
      raids: orchestrator.listRaids().length,
    };
  });

  app.get("/v1/agent.json", async () => {
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

  app.get("/v1/attested-runtime", async (_request, reply) => {
    if (!teeSigner.account) {
      reply.code(503);
      return {
        error: "tee_signer_not_configured",
        message: teeSigner.error ?? "MNEMONIC environment variable is required for attested runtime proofs.",
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

  app.get("/v1/runtime", async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const teeSocketPath = env.BOSSRAID_TEE_SOCKET_PATH ?? "/var/run/tappd.sock";
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
        sandboxMode: env.BOSSRAID_EVAL_SANDBOX_MODE ?? "host",
        workerIsolation,
        jobTimeoutMs: readPositiveInteger(env.BOSSRAID_EVAL_JOB_TIMEOUT_MS, 45_000),
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

  app.post("/v1/runtime/evaluator-smoke", async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    if (!runtimeExecutionEnabled(env)) {
      reply.code(503);
      return {
        error: "runtime_execution_disabled",
        message: "Runtime execution must be enabled before evaluator smoke checks can run.",
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

  app.get("/v1/ops/session", async (request, reply) => {
    if (!adminToken) {
      reply.code(503);
      return {
        error: "admin_auth_not_configured",
        message: "BOSSRAID_ADMIN_TOKEN is required for this route.",
      };
    }

    const session = readOpsSession(request.headers);
    if (session || safeEqualString(asSingleHeader(request.headers.authorization), `Bearer ${adminToken}`)) {
      return {
        authenticated: true,
        expiresAt: session ? new Date(session.expiresAt).toISOString() : undefined,
      };
    }

    reply.code(401);
    return {
      authenticated: false,
      error: "unauthorized",
    };
  });
  app.post("/v1/ops/session", async (request, reply) => {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      "ops-session",
      opsSessionRateLimitMax,
      opsSessionRateLimitWindowMs,
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    if (!adminToken) {
      reply.code(503);
      return {
        error: "admin_auth_not_configured",
        message: "BOSSRAID_ADMIN_TOKEN is required for this route.",
      };
    }

    const credentials = parseOpsSessionInput(request.body);
    if (!safeEqualString(credentials.token, adminToken)) {
      reply.code(401);
      return {
        authenticated: false,
        error: "unauthorized",
      };
    }

    const session = issueOpsSession(reply);
    return {
      authenticated: true,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  });
  app.delete("/v1/ops/session", async (request, reply) => {
    clearOpsSession(reply, request.headers);
    return {
      authenticated: false,
    };
  });

  app.get("/v1/raids", async (request, reply) => {
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
      successfulSubmissionCount: raid.rankedSubmissions.filter((item) => item.breakdown.valid).length,
    }));
  });
  app.post("/v1/chat/completions", async (request, reply) => {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      "public-action",
      publicRateLimitMax,
      publicRateLimitWindowMs,
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const chatRequest = parseChatCompletionRequest(request.body);
    const raidRequest =
      chatRequest.raidRequest ?? parseBossRaidRequest(buildBossRaidRequestFromChatCompletion(chatRequest));
    await ensureErc8004ProofState({ includeMercenary: false });
    const payment = await requireReservedLaunchPayment("chat", request, raidRequest);
    const spawn =
      payment.reservationId && payment.requestKey
        ? await orchestrator.spawnReservedRaid(payment.reservationId, payment.requestKey)
        : await orchestrator.spawnRaid(raidRequest);
    const outcome = await waitForRaidOutput(
      orchestrator,
      spawn.raidId,
      Math.min(raidRequest.constraints.maxLatencySec * 1000, 15_000),
      Math.min(Math.max(raidRequest.constraints.numExperts, 1), Math.max(spawn.selectedExperts, 1)),
    );

    const approved = outcome.result?.approvedSubmissions ?? [];
    const synthesized = outcome.result?.synthesizedOutput;
    const primary = outcome.result?.primarySubmission;
    const content =
      synthesized?.answerText ??
      synthesized?.explanation ??
      primary?.submission.answerText ??
      primary?.submission.explanation ??
      (outcome.status.status === "final"
        ? "Raid finished without an approved provider output."
        : `Raid ${spawn.raidId} started. No approved provider output yet.`);

    const response = {
      id: `chatcmpl_${spawn.raidId}`,
      object: "chat.completion",
      model: chatRequest.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
      raid: {
        raid_id: spawn.raidId,
        raid_access_token: spawn.raidAccessToken,
        receipt_path: spawn.receiptPath,
        agents_invited: spawn.selectedExperts,
        agents_succeeded: synthesized?.contributingProviderIds.length ?? approved.length,
        successful_agents: approved.map((entry) => entry.submission.providerId),
        synthesized_from_agents: synthesized?.contributingProviderIds,
        base_agent: synthesized?.baseSubmissionProviderId,
      },
    };
    applyX402Headers(reply, {
      settlement: payment.settlement,
    });
    return response;
  });
  app.post("/v1/raid", async (request, reply) => {
    return spawnParsedRaid(request, reply, parseBossRaidRequest);
  });
  app.post("/v1/demo/raid", async (request, reply) => {
    const demoAccessError = requireDemoRouteAccess(reply, request.headers);
    if (demoAccessError) {
      return demoAccessError;
    }

    return spawnParsedRaid(request, reply, parseBossRaidRequest, {
      requirePayment: false,
    });
  });
  app.post("/v1/raids", async (request, reply) => {
    return spawnParsedRaid(request, reply, parseBossRaidSpawnInput);
  });
  registerRaidRoutes("/v1/raid");
  registerRaidRoutes("/v1/raids");
  app.post("/v1/evaluations/:raidId/replay", async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return orchestrator.replayEvaluation((request.params as { raidId: string }).raidId);
  });
  app.post("/v1/providers/:providerId/heartbeat", async (request, reply) => {
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
      return { error: "unauthorized" };
    }
    const heartbeat = parseProviderHeartbeat(request.body, params.providerId);
    const validation = validateProviderCallback(
      heartbeat.raidId,
      params.providerId,
      heartbeat.providerRunId,
    );
    if (!validation.ok) {
      reply.code(validation.statusCode);
      return validation.body;
    }
    return orchestrator.recordProviderHeartbeat(heartbeat.raidId, params.providerId, heartbeat);
  });
  app.post("/v1/providers/:providerId/submit", { bodyLimit: providerSubmissionBodyLimitBytes }, async (request, reply) => {
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
      return { error: "unauthorized" };
    }
    const submission = parseProviderSubmission(request.body, params.providerId);
    const validation = validateProviderCallback(
      submission.raidId,
      params.providerId,
      submission.providerRunId,
    );
    if (!validation.ok) {
      reply.code(validation.statusCode);
      return validation.body;
    }
    return orchestrator.recordProviderSubmission(submission.raidId, submission);
  });
  app.post("/v1/providers/:providerId/failure", async (request, reply) => {
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
      return { error: "unauthorized" };
    }

    const failure = parseProviderFailure(request.body, params.providerId);
    const validation = validateProviderCallback(
      failure.raidId,
      params.providerId,
      failure.providerRunId,
    );
    if (!validation.ok) {
      reply.code(validation.statusCode);
      return validation.body;
    }
    return orchestrator.recordProviderFailure(failure.raidId, params.providerId, failure);
  });
  app.get("/v1/providers", async () => {
    const providers = orchestrator.listProviders();
    await ensureErc8004ProofState({ includeMercenary: false, providers });
    return providers.map((provider) => serializeProviderProfile(provider));
  });
  app.get("/v1/providers/health", async () =>
    (await Promise.all(orchestrator.listProviders().map((provider) => probeProviderHealth(provider)))).map((health) =>
      serializeProviderHealth(health),
    ),
  );
  app.get("/v1/providers/:providerId/stats", async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const providerId = (request.params as { providerId: string }).providerId;
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: "not_found" };
    }
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });

  app.post("/agents/register", async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: "registry_auth_not_configured" };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: "unauthorized" };
    }
    const provider = orchestrator.upsertRegisteredProvider(parseProviderRegistrationInput(request.body));
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });
  app.post("/agents/heartbeat", async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: "registry_auth_not_configured" };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: "unauthorized" };
    }
    const provider = orchestrator.recordAgentHeartbeat(parseAgentHeartbeatInput(request.body));
    if (!provider) {
      reply.code(404);
      return { error: "not_found" };
    }
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });
  app.get("/agents/discover", async (request) => {
    await ensureErc8004ProofState({ includeMercenary: false });
    return (await orchestrator.discoverProviders(parseProviderDiscoveryQuery(request.query))).map((provider) =>
      serializeProviderProfile(provider),
    );
  });

  return app;
}

const OPS_SESSION_COOKIE_NAME = "bossraid_ops_session";
const RAID_ACCESS_TOKEN_HEADER = "x-bossraid-raid-token";

function hashRaidAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function asSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function asSingleQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function readClientRateLimitKey(request: FastifyRequest): string {
  return request.ip;
}

function buildLaunchRequestKey(
  request: FastifyRequest,
  route: "raid" | "chat",
  input: BossRaidSpawnInput,
): string {
  return createHash("sha256")
    .update(`${readClientRateLimitKey(request)}\n${route}\n${stableStringify(input)}`)
    .digest("hex");
}

function safeEqualString(left: string | undefined, right: string): boolean {
  if (typeof left !== "string") {
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
  const entries = header.split(";");
  const cookies: Record<string, string> = {};

  for (const entry of entries) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
    secure?: boolean;
  },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readBooleanEnv(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function readMercenaryErc8004Identity(env: NodeJS.ProcessEnv): Erc8004Identity | undefined {
  const agentId = env.BOSSRAID_ERC8004_AGENT_ID?.trim();
  if (!agentId) {
    return undefined;
  }

  const validationTxs = env.BOSSRAID_ERC8004_VALIDATION_TXS?.split(",")
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
  workerIsolation: "per_job_process" | "per_job_container",
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
      "package.json",
      JSON.stringify(
        {
          name: "bossraid-evaluator-smoke",
          private: true,
          type: "module",
          scripts: {
            test: "node --test",
          },
        },
        null,
        2,
      ),
    ),
    createSmokeFile(
      "sum.js",
      [
        "export function sum(a, b) {",
        "  return a + b;",
        "}",
      ].join("\n"),
    ),
    createSmokeFile(
      "sum.test.js",
      [
        'import assert from "node:assert/strict";',
        'import test from "node:test";',
        'import { sum } from "./sum.js";',
        "",
        'test("sum adds positive integers", () => {',
        "  assert.equal(sum(2, 3), 5);",
        "});",
      ].join("\n"),
    ),
  ];

  return {
    task: {
      taskTitle: "Evaluator smoke test",
      taskDescription: "Confirm the configured evaluator can execute an isolated Node built-in test suite.",
      language: "text",
      framework: "node",
      files,
      failingSignals: {
        errors: ["sum must return the correct arithmetic result."],
        tests: ["node --test"],
        reproSteps: ["Run node --test in the workspace."],
      },
      output: {
        primaryType: "patch",
        artifactTypes: ["patch", "text"],
      },
      constraints: {
        numExperts: 1,
        maxBudgetUsd: 1,
        maxLatencySec: 30,
        allowExternalSearch: false,
        requireSpecializations: ["node"],
        minReputation: 0,
        allowedOutputTypes: ["patch", "text"],
        privacyMode: "off",
      },
      rewardPolicy: {
        splitStrategy: "equal_success_only",
      },
      privacyMode: {
        redactSecrets: false,
        redactIdentifiers: false,
        allowFullRepo: false,
      },
      hostContext: {
        host: "codex",
      },
      originalFileCount: files.length,
      originalBytes: files.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0),
      sanitizationReport: {
        redactedSecrets: 0,
        redactedIdentifiers: 0,
        removedUrls: 0,
        trimmedFiles: 0,
        unsafeContentDetected: false,
        riskTier: "safe",
        issues: [],
      },
    },
    files,
    touchedFiles: ["sum.js"],
  };
}

function createSmokeFile(path: string, content: string): TaskFile {
  return {
    path,
    content,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}

function buildAttestedRuntimeMessage(payload: AttestedRuntimePayload): string {
  return [
    "BossRaidAttestedRuntime",
    `version=${payload.version}`,
    `nonce=${payload.nonce}`,
    `timestamp=${payload.timestamp}`,
    `deploymentTarget=${payload.deploymentTarget ?? "unknown"}`,
    `teePlatform=${payload.teePlatform ?? "unknown"}`,
    `storageBackend=${payload.storageBackend}`,
    `providers=${payload.providers}`,
    `readyProviders=${payload.readyProviders}`,
    `raids=${payload.raids}`,
    `evaluatorTransport=${payload.evaluatorTransport}`,
    `workerIsolation=${payload.workerIsolation}`,
  ].join("|");
}

function buildAttestedRaidResultPayload(
  env: NodeJS.ProcessEnv,
  result: BossRaidResultOutput,
  workerIsolation: "per_job_process" | "per_job_container",
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
    "BossRaidAttestedResult",
    `version=${payload.version}`,
    `nonce=${payload.nonce}`,
    `timestamp=${payload.timestamp}`,
    `deploymentTarget=${payload.deploymentTarget ?? "unknown"}`,
    `teePlatform=${payload.teePlatform ?? "unknown"}`,
    `evaluatorTransport=${payload.evaluatorTransport}`,
    `workerIsolation=${payload.workerIsolation}`,
    `raidId=${payload.raidId}`,
    `status=${payload.status}`,
    `approvedSubmissionCount=${payload.approvedSubmissionCount}`,
    `resultHash=${payload.resultHash}`,
  ].join("|");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }

  return value;
}

function hashAttestationText(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function readStorageBackend(env: NodeJS.ProcessEnv): "sqlite" | "file" | "memory" {
  if (env.BOSSRAID_STORAGE_BACKEND === "sqlite" || env.BOSSRAID_STORAGE_BACKEND === "file" || env.BOSSRAID_STORAGE_BACKEND === "memory") {
    return env.BOSSRAID_STORAGE_BACKEND;
  }

  return env.BOSSRAID_STATE_FILE ? "file" : "sqlite";
}

async function readTeeSocketState(path: string): Promise<{ pathExists: boolean; socketMounted: boolean }> {
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

function parseOpsSessionInput(value: unknown): { token: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiContractError("Expected object for ops_session.");
  }

  const token = (value as Record<string, unknown>).token;
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new ApiContractError("Expected non-empty string for ops_session.token.");
  }

  return {
    token: token.trim(),
  };
}

async function waitForRaidOutput(
  orchestrator: BossRaidOrchestrator,
  raidId: string,
  timeoutMs: number,
  minApprovedSubmissions = 1,
) {
  const deadline = Date.now() + Math.max(timeoutMs, 1_000);

  while (Date.now() < deadline) {
    const status = orchestrator.getStatus(raidId);
    const result = orchestrator.getResult(raidId);
    const approvedCount = result.approvedSubmissions?.length ?? 0;
    if (
      (result.synthesizedOutput && approvedCount >= Math.max(minApprovedSubmissions, 1)) ||
      ["final", "cancelled", "expired"].includes(status.status)
    ) {
      return { status, result };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    status: orchestrator.getStatus(raidId),
    result: orchestrator.getResult(raidId),
  };
}

async function main() {
  const orchestrator = await createDefaultOrchestrator(runtimeOptionsFromEnv());
  const app = buildApiServer(orchestrator);
  const port = Number(process.env.PORT || "8787");
  const host = process.env.BOSSRAID_API_HOST ?? process.env.HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  console.log(`Boss Raid API listening on http://${host}:${port}`);
  registerShutdownHandlers(async () => {
    await app.close();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
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
    console.log(`Shutting down Boss Raid API after ${signal}`);
    try {
      await closeServer();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
