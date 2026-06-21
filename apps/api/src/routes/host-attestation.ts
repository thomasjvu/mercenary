import { readTeeSocketPath } from '@bossraid/constants';
import { type FastifyInstance } from 'fastify';
import { verifyPhalaTeeAttestation } from '@bossraid/privacy-engine';
import type { TeeAttestationResult, TeeAttestationView } from '@bossraid/shared-types';
import {
  buildAttestedRuntimeMessage,
  buildAttestedRuntimePayload,
  hashAttestationText,
} from '../lib/attestation.js';
import { serializeTeeAttestation } from '../lib/serializers.js';
import { readTeeSocketState } from '../lib/tee.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

const HOST_ATTESTATION_CACHE_TTL_MS = 10 * 60 * 1000;
const HOST_TEE_INFO_TIMEOUT_MS = 10_000;
const HOST_TEE_GET_QUOTE_TIMEOUT_MS = 90_000;
const hostAttestationCache = new Map<string, { expiresAt: number; result: TeeAttestationResult }>();

export type HostAttestationSignedRuntime = {
  signer: string;
  message: string;
  messageHash: `0x${string}`;
  signature: `0x${string}`;
  payload: ReturnType<typeof buildAttestedRuntimePayload>;
};

export type HostAttestationResponse = {
  object: 'host_attestation';
  deploymentTarget: string | null;
  teePlatform: string | null;
  verified: boolean;
  teeVerified: boolean;
  runtimeSigned: boolean;
  verifiedAt: string;
  teeAttestation?: TeeAttestationView;
  signedRuntime?: HostAttestationSignedRuntime;
};

function hostSkipCloudVerify(): boolean {
  return process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY === '1';
}

function warmupHostTeeAttestation(
  env: ApiContext['env'],
  teeSocketPath: string,
  teeSocket: { pathExists: boolean; socketMounted: boolean }
): void {
  if (env.BOSSRAID_TEE_PLATFORM !== 'phala' || !teeSocket.pathExists || !teeSocket.socketMounted) {
    return;
  }

  void verifyPhalaTeeAttestation(
    'bossraid-host',
    teeSocketPath,
    hostAttestationCache,
    HOST_ATTESTATION_CACHE_TTL_MS,
    {
      reportData: 'bossraid-host',
      runtimeMode: env.BOSSRAID_TEE_RUNTIME_MODE ?? 'phala-cvm',
      rpcTimeoutMs: HOST_TEE_INFO_TIMEOUT_MS,
      getQuoteTimeoutMs: HOST_TEE_GET_QUOTE_TIMEOUT_MS,
      skipCloudVerify: hostSkipCloudVerify(),
    }
  ).catch(() => undefined);
}

export function registerHostAttestationRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { env, orchestrator, teeSigner, workerIsolation } = ctx;
  const { collectProviderHealth } = handlers.raid;
  const { requireRateLimit } = handlers.auth;
  const teeSocketPath = readTeeSocketPath(env);

  void readTeeSocketState(teeSocketPath).then((teeSocket) => {
    warmupHostTeeAttestation(env, teeSocketPath, teeSocket);
  });

  app.get('/v1/host/attestation', async (request, reply) => {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      'host_attestation',
      ctx.publicRateLimitMax,
      ctx.publicRateLimitWindowMs
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const teePlatform = env.BOSSRAID_TEE_PLATFORM ?? null;
    const deploymentTarget = env.BOSSRAID_DEPLOY_TARGET ?? null;
    const teeSocket = await readTeeSocketState(teeSocketPath);

    let teeAttestation: TeeAttestationResult | undefined;
    if (teePlatform === 'phala' && teeSocket.pathExists && teeSocket.socketMounted) {
      teeAttestation = await verifyPhalaTeeAttestation(
        'bossraid-host',
        teeSocketPath,
        hostAttestationCache,
        HOST_ATTESTATION_CACHE_TTL_MS,
        {
          reportData: 'bossraid-host',
          runtimeMode: env.BOSSRAID_TEE_RUNTIME_MODE ?? 'phala-cvm',
          rpcTimeoutMs: HOST_TEE_INFO_TIMEOUT_MS,
          getQuoteTimeoutMs: HOST_TEE_GET_QUOTE_TIMEOUT_MS,
          skipCloudVerify: hostSkipCloudVerify(),
        }
      );
    } else if (teePlatform === 'phala') {
      reply.code(503);
      return {
        error: 'tee_unavailable',
        message: 'Phala TEE socket is not mounted on this host.',
      };
    }

    let signedRuntime: HostAttestationSignedRuntime | undefined;
    if (teeSigner.account) {
      const providerHealth = await collectProviderHealth();
      const payload = buildAttestedRuntimePayload(
        env,
        orchestrator,
        providerHealth,
        workerIsolation
      );
      const message = buildAttestedRuntimeMessage(payload);
      const signature = await teeSigner.account.signMessage({ message });
      signedRuntime = {
        signer: teeSigner.account.address,
        message,
        messageHash: hashAttestationText(message),
        signature,
        payload,
      };
    }

    if (!teeAttestation && !signedRuntime) {
      reply.code(503);
      return {
        error: 'tee_unavailable',
        message:
          teeSigner.error ??
          'Host TEE attestation is unavailable. Configure Phala tappd or MNEMONIC for signed proofs.',
      };
    }

    const verifiedAt = teeAttestation?.verifiedAt ?? new Date().toISOString();
    const teeVerified = Boolean(teeAttestation?.valid);
    const runtimeSigned = Boolean(signedRuntime);
    const response: HostAttestationResponse = {
      object: 'host_attestation',
      deploymentTarget,
      teePlatform,
      verified: teeVerified,
      teeVerified,
      runtimeSigned,
      verifiedAt,
      teeAttestation: teeAttestation ? serializeTeeAttestation(teeAttestation) : undefined,
      signedRuntime,
    };

    return response;
  });
}
