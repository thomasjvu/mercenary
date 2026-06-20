import { type FastifyInstance } from 'fastify';
import { verifyPhalaTeeAttestation, buildQuoteExplorerUrl } from '@bossraid/privacy-engine';
import type { TeeAttestationResult, TeeAttestationView } from '@bossraid/shared-types';
import {
  buildAttestedRuntimeMessage,
  buildAttestedRuntimePayload,
  hashAttestationText,
} from '../lib/attestation.js';
import { readTeeSocketState } from '../lib/tee.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

const HOST_ATTESTATION_CACHE_TTL_MS = 10 * 60 * 1000;
const HOST_TEE_VERIFY_TIMEOUT_MS = 45_000;
const hostAttestationCache = new Map<string, { expiresAt: number; result: TeeAttestationResult }>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

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
  verifiedAt: string;
  teeAttestation?: TeeAttestationView;
  signedRuntime?: HostAttestationSignedRuntime;
};

function serializeTeeAttestation(tee: TeeAttestationResult): TeeAttestationView {
  const explorerUrl = tee.explorerUrl ?? buildQuoteExplorerUrl(tee.signature);
  return {
    valid: tee.valid,
    providerId: tee.providerId,
    verifiedAt: tee.verifiedAt,
    expiresAt: tee.expiresAt,
    vendor: tee.vendor,
    enclaveHash: tee.enclaveHash,
    signature: tee.signature,
    runtimeMode: tee.runtimeMode,
    notes: tee.notes,
    upstreamVendor: tee.upstreamVendor,
    signingAddress: tee.signingAddress,
    e2eeReady: tee.e2eeReady,
    explorerUrl,
    checks: tee.checks,
  };
}

export function registerHostAttestationRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { env, orchestrator, teeSigner, workerIsolation } = ctx;
  const { collectProviderHealth } = handlers.raid;
  const { requireRateLimit } = handlers.auth;

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
    const teeSocketPath = env.BOSSRAID_TEE_SOCKET_PATH ?? '/var/run/tappd.sock';
    const teeSocket = await readTeeSocketState(teeSocketPath);

    let teeAttestation: TeeAttestationResult | undefined;
    let teeVerifyError: string | undefined;
    if (teePlatform === 'phala' && teeSocket.pathExists && teeSocket.socketMounted) {
      try {
        teeAttestation = await withTimeout(
          verifyPhalaTeeAttestation(
            'bossraid-host',
            teeSocketPath,
            hostAttestationCache,
            HOST_ATTESTATION_CACHE_TTL_MS,
            {
              reportData: 'bossraid-host',
              runtimeMode: env.BOSSRAID_TEE_RUNTIME_MODE ?? 'phala-cvm',
            }
          ),
          HOST_TEE_VERIFY_TIMEOUT_MS,
          'Phala host TEE verification'
        );
      } catch (error) {
        teeVerifyError =
          error instanceof Error ? error.message : 'Phala host TEE verification failed.';
      }
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
          teeVerifyError ??
          teeSigner.error ??
          'Host TEE attestation is unavailable. Configure Phala tappd or MNEMONIC for signed proofs.',
      };
    }

    const verifiedAt = teeAttestation?.verifiedAt ?? new Date().toISOString();
    const response: HostAttestationResponse = {
      object: 'host_attestation',
      deploymentTarget,
      teePlatform,
      verified: Boolean(teeAttestation?.valid || signedRuntime),
      verifiedAt,
      teeAttestation: teeAttestation ? serializeTeeAttestation(teeAttestation) : undefined,
      signedRuntime,
    };

    return response;
  });
}
