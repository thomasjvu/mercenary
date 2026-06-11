import { type FastifyInstance } from 'fastify';
import { DEFAULTS, readStorageBackend } from '@bossraid/constants';
import {
  cleanupWorkspace,
  materializeWorkspace,
  runRuntimeProbes,
  runtimeExecutionEnabled,
  runtimeExecutionTransport,
  unsafeHostExecutionAllowed,
} from '@bossraid/sandbox-runner';
import { readBooleanEnv, readPositiveInteger } from '../lib/env.js';
import { asSingleHeader } from '@bossraid/shared-types';
import { safeEqualString, parseOpsSessionInput } from '../lib/http.js';
import {
  buildAttestedRuntimePayload,
  buildAttestedRuntimeMessage,
  hashAttestationText,
} from '../lib/attestation.js';
import { buildAgentManifest } from '../agent-artifacts.js';
import { buildEvaluatorSmokeTask } from '../lib/evaluator-smoke.js';
import { readTeeSocketState } from '../lib/tee.js';
import { buildX402SettingsView } from '../lib/x402-runtime.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../api-handlers.js';

export function registerOpsRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const {
    orchestrator,
    env,
    controlState,
    adminToken,
    apiBodyLimitBytes,
    trustProxy,
    providerHealthTimeoutMs,
    publicRateLimitMax,
    publicRateLimitWindowMs,
    opsSessionTtlSec,
    opsSessionRateLimitMax,
    opsSessionRateLimitWindowMs,
    evaluatorMaxConcurrentJobs,
    workerIsolation,
    teeSigner,
    mercenaryIdentity,
  } = ctx;
  const { requireAdmin, requireRateLimit, readOpsSession, issueOpsSession, clearOpsSession } =
    handlers.auth;
  const { collectProviderHealth, ensureErc8004ProofState } = handlers.raid;

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

  app.get('/v1/ops/settings', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return {
      x402: buildX402SettingsView(ctx),
    };
  });

  app.patch('/v1/ops/settings', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const body = request.body as { x402Enabled?: unknown };
    if (typeof body?.x402Enabled !== 'boolean') {
      reply.code(400);
      return {
        error: 'bad_request',
        message: 'PATCH /v1/ops/settings expects { "x402Enabled": boolean }.',
      };
    }

    if (body.x402Enabled) {
      const settingsView = buildX402SettingsView(ctx);
      if (!settingsView.canEnable) {
        reply.code(400);
        return {
          error: 'bad_request',
          message:
            'Configure BOSSRAID_X402_PAY_TO with a real recipient wallet before enabling x402 payments.',
        };
      }
    }

    controlState.setX402Enabled(body.x402Enabled);

    return {
      x402: buildX402SettingsView(ctx),
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
}
