import { randomUUID } from 'node:crypto';
import {
  defaultModelBaseForHarness,
  runAgentHarnessLoop,
  type HarnessKind,
  type HarnessRuntimeConfig,
} from '@bossraid/agent-harness';
import { NETWORK, UPSTREAM_PROVIDER_CONFIG } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { buildPrivacyAttestation } from '@bossraid/privacy-engine';
import type {
  PrivacyFeatureKey,
  ProviderHealthStatus,
  ProviderProfile,
  ProviderTaskPackage,
} from '@bossraid/shared-types';
import type { ApiControlState } from '../control-state.js';
import { buildInferenceReceipt, verifyUpstreamTee } from './attestation-service.js';
import type { InferenceReceiptStore } from './inference-receipt-store.js';
import { extractInferencePromptFromTask } from './task-prompt.js';
import { generateAttestationNonce, probeUpstreamChatCompletion } from './upstream/index.js';
import { resolveHostedUpstreamApiKey } from './platform-liquidity.js';
import { harnessKindForUpstream } from './upstream-offers.js';
import { probeVeniceE2eeChatCompletion } from './venice-e2ee.js';

export function resolveInferenceGatewayBase(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.BOSSRAID_INFERENCE_GATEWAY_BASE?.trim();
  if (configured) {
    return configured.replace(/\/+$/u, '');
  }

  const host = env.BOSSRAID_API_HOST ?? env.HOST ?? NETWORK.LOCALHOST;
  const port = env.PORT ?? String(NETWORK.LOCAL_API_PORT);
  return `http://${host}:${port}`;
}

export function resolveInferenceGatewayProviderEndpoint(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${resolveInferenceGatewayBase(env)}/gateway/${encodeURIComponent(providerId)}`;
}

export function buildUpstreamSellerProviderId(
  provider: string,
  wallet: string,
  modelId: string
): string {
  const walletSlice = wallet.slice(2, 8).toLowerCase();
  const modelSlug = modelId
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${provider}-seller-${walletSlice}-${modelSlug}`.slice(0, 96);
}

export function resolveHostedProviderUpstream(
  provider: ProviderProfile
): UpstreamProviderId | undefined {
  if (provider.source?.targetType && isUpstreamProviderId(provider.source.targetType)) {
    return provider.source.targetType;
  }
  if (provider.source?.type === 'venice_hosted') {
    return 'venice';
  }
  if (provider.modelProvider && isUpstreamProviderId(provider.modelProvider)) {
    return provider.modelProvider;
  }
  return undefined;
}

export function isHostedInferenceProvider(provider: ProviderProfile): boolean {
  return (
    provider.source?.type === 'inference_hosted' ||
    provider.source?.type === 'venice_hosted' ||
    provider.source?.type === 'harness_hosted'
  );
}

export function isHostedHarnessProvider(provider: ProviderProfile): boolean {
  return provider.source?.type === 'harness_hosted';
}

export function probeHostedInferenceProviderHealth(
  controlState: ApiControlState,
  provider: ProviderProfile,
  env: NodeJS.ProcessEnv = process.env
): ProviderHealthStatus {
  const wallet = provider.source?.externalRef;
  const upstream = resolveHostedProviderUpstream(provider);
  const configured =
    wallet && upstream
      ? Boolean(
          resolveHostedUpstreamApiKey({
            controlState,
            wallet,
            upstream,
            env,
          }) || controlState.readSellerUpstreamConfig(wallet, upstream)
        )
      : false;

  return {
    providerId: provider.providerId,
    providerName: provider.displayName,
    endpoint: provider.endpoint,
    reachable: configured,
    ready: configured,
    statusCode: configured ? 200 : 503,
    missing: configured
      ? undefined
      : [`BOSSRAID_${(upstream ?? 'UPSTREAM').toUpperCase()}_API_KEY`],
    agentFramework: provider.agentFramework ?? 'custom',
    modelProvider: provider.modelProvider ?? upstream ?? 'unknown',
    model: provider.modelId ?? null,
    harnessProfile: provider.harnessProfile,
    error: configured
      ? undefined
      : `${upstream ?? 'Upstream'} API key is not configured for this seller.`,
  };
}

export async function runInferenceGatewayJob(input: {
  orchestrator: BossRaidOrchestrator;
  controlState: ApiControlState;
  inferenceReceiptStore: InferenceReceiptStore;
  provider: ProviderProfile;
  body: {
    raidId: string;
    providerId: string;
    task: ProviderTaskPackage;
    deadlineUnix: number;
  };
  providerRunId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const wallet = input.provider.source?.externalRef;
  const upstream = resolveHostedProviderUpstream(input.provider);
  if (!wallet || !upstream) {
    await input.orchestrator.recordProviderFailure(input.body.raidId, input.provider.providerId, {
      raidId: input.body.raidId,
      providerId: input.provider.providerId,
      providerRunId: input.providerRunId,
      message: 'inference_hosted seller wallet or upstream missing',
      failedAt: new Date().toISOString(),
    });
    return;
  }

  const upstreamModelId =
    input.provider.pricing?.upstreamModelId ?? input.provider.modelId ?? input.body.providerId;

  try {
    const resolvedApiKey = resolveHostedUpstreamApiKey({
      controlState: input.controlState,
      wallet,
      upstream,
      env: input.env,
    });
    if (!resolvedApiKey) {
      throw new Error(`${upstream} API key is not configured for this seller.`);
    }

    const prompt = extractInferencePromptFromTask(input.body.task.task);
    const chatResult =
      upstream === 'venice' && input.provider.privacy?.e2ee === true
        ? await probeVeniceE2eeChatCompletion({
            apiKey: resolvedApiKey,
            modelId: upstreamModelId,
            prompt,
            providerId: input.body.providerId,
          })
        : await probeUpstreamChatCompletion({
            provider: upstream,
            apiKey: resolvedApiKey,
            modelId: upstreamModelId,
            prompt,
            env: input.env,
          });

    const providerClaimsE2ee = input.provider.privacy?.e2ee === true;
    const featuresClaimed: PrivacyFeatureKey[] = [];
    if (input.provider.privacy?.teeAttested) {
      featuresClaimed.push('tee_attested');
    }
    if (input.provider.privacy?.signedOutputs) {
      featuresClaimed.push('signed_outputs');
    }
    if (input.provider.privacy?.noDataRetention) {
      featuresClaimed.push('no_data_retention');
    }

    let privacyAttestation;
    if (featuresClaimed.length > 0 || providerClaimsE2ee || input.provider.privacy?.teeAttested) {
      const nonce = generateAttestationNonce();
      const { attestation: teeResult } = await verifyUpstreamTee({
        provider: upstream,
        modelId: upstreamModelId,
        apiKey: resolvedApiKey,
        providerId: input.body.providerId,
        nonce,
        env: input.env,
      });

      if (
        (input.provider.privacy?.teeAttested || providerClaimsE2ee) &&
        (!teeResult.valid || (providerClaimsE2ee && !teeResult.e2eeReady))
      ) {
        throw new Error('Hosted provider TEE/E2EE attestation failed.');
      }

      const featuresVerified: PrivacyFeatureKey[] = [];
      if (teeResult.valid && featuresClaimed.includes('tee_attested')) {
        featuresVerified.push('tee_attested');
      }
      if (teeResult.valid && providerClaimsE2ee && teeResult.e2eeReady) {
        featuresClaimed.push('e2ee');
        featuresVerified.push('e2ee');
      }

      const receipt = buildInferenceReceipt({
        store: input.inferenceReceiptStore,
        modelId: upstreamModelId,
        providerId: input.body.providerId,
        route: 'gateway',
        tee: teeResult,
        transport: providerClaimsE2ee && teeResult.e2eeReady ? 'venice-e2ee' : 'plaintext',
        inputText: prompt,
        outputText: chatResult.content,
        nonce,
      });

      privacyAttestation = buildPrivacyAttestation({
        providerId: input.provider.providerId,
        raidId: input.body.raidId,
        featuresClaimed,
        featuresVerified,
        teeAttestation: teeResult,
        externalApiCalls: [`${upstream}:chat/completions`],
        dataRetained: false,
      });
      privacyAttestation.inferenceReceiptId = receipt.receiptId;
    }

    await input.orchestrator.recordProviderSubmission(input.body.raidId, {
      raidId: input.body.raidId,
      providerId: input.provider.providerId,
      providerRunId: input.providerRunId,
      answerText: chatResult.content,
      explanation: `${upstream} hosted gateway completed ${upstreamModelId}.`,
      confidence: 0.92,
      filesTouched: [],
      submittedAt: new Date().toISOString(),
      privacyAttestation,
    });
  } catch (error) {
    await input.orchestrator.recordProviderFailure(input.body.raidId, input.provider.providerId, {
      raidId: input.body.raidId,
      providerId: input.provider.providerId,
      providerRunId: input.providerRunId,
      message: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
    });
  }
}

/**
 * Multi-tenant harness seat: seller key from control state, tool loop on platform process.
 * No new Phala CVM — shared always-on host runs an ephemeral workspace per accept.
 */
export async function runHarnessGatewayJob(input: {
  orchestrator: BossRaidOrchestrator;
  controlState: ApiControlState;
  provider: ProviderProfile;
  body: {
    raidId: string;
    providerId: string;
    task: ProviderTaskPackage;
    deadlineUnix: number;
  };
  providerRunId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const env = input.env ?? process.env;
  const wallet = input.provider.source?.externalRef;
  const upstream = resolveHostedProviderUpstream(input.provider);
  if (!wallet || !upstream) {
    await input.orchestrator.recordProviderFailure(input.body.raidId, input.provider.providerId, {
      raidId: input.body.raidId,
      providerId: input.provider.providerId,
      providerRunId: input.providerRunId,
      message: 'harness_hosted seller wallet or upstream missing',
      failedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const resolvedApiKey = resolveHostedUpstreamApiKey({
      controlState: input.controlState,
      wallet,
      upstream,
      env,
    });
    if (!resolvedApiKey) {
      throw new Error(`${upstream} API key is not configured for this seller.`);
    }

    const kind = harnessKindForUpstream(upstream);
    if (kind === 'off') {
      throw new Error(`Upstream ${upstream} does not support platform harness seats.`);
    }

    const modelId =
      input.provider.pricing?.upstreamModelId ??
      input.provider.modelId ??
      input.provider.harnessProfile?.planProvider ??
      'unknown';
    const apiBase =
      env[`BOSSRAID_${upstream.toUpperCase()}_API_BASE`]?.trim() ||
      env.BOSSRAID_CHUTES_LLM_BASE?.trim() ||
      UPSTREAM_PROVIDER_CONFIG[upstream].upstreamBase ||
      defaultModelBaseForHarness(kind);

    const config: HarnessRuntimeConfig = {
      kind,
      installation: input.provider.harnessProfile?.installation ?? 'fresh',
      skills: input.provider.harnessProfile?.skills ?? [],
      imageDigest: input.provider.harnessProfile?.imageDigest,
      modelId,
      modelApiBase: apiBase,
      planProvider: input.provider.harnessProfile?.planProvider ?? upstream,
      maxSteps: Math.max(1, Math.min(32, Number(env.BOSSRAID_HARNESS_MAX_STEPS ?? '10') || 10)),
      allowShell: false,
    };

    const timeRemainingMs = Math.max(input.body.deadlineUnix * 1000 - Date.now() - 1000, 5_000);
    const submission = await runAgentHarnessLoop({
      task: input.body.task,
      config,
      apiBase,
      apiKey: resolvedApiKey,
      model: modelId,
      timeoutMs: timeRemainingMs,
      onProgress: (message, progress) => {
        void input.orchestrator.recordProviderHeartbeat(
          input.body.raidId,
          input.provider.providerId,
          {
            raidId: input.body.raidId,
            providerId: input.provider.providerId,
            providerRunId: input.providerRunId,
            progress,
            message,
            timestamp: new Date().toISOString(),
          }
        );
      },
    });

    const featuresClaimed: PrivacyFeatureKey[] = [];
    if (input.provider.privacy?.teeAttested) featuresClaimed.push('tee_attested');
    if (input.provider.privacy?.signedOutputs) featuresClaimed.push('signed_outputs');
    if (input.provider.privacy?.noDataRetention) featuresClaimed.push('no_data_retention');

    const privacyAttestation =
      featuresClaimed.length > 0
        ? buildPrivacyAttestation({
            providerId: input.provider.providerId,
            raidId: input.body.raidId,
            featuresClaimed,
            featuresVerified: [],
            externalApiCalls: [`${apiBase}/chat/completions`],
            dataRetained: false,
          })
        : undefined;

    await input.orchestrator.recordProviderSubmission(input.body.raidId, {
      raidId: input.body.raidId,
      providerId: input.provider.providerId,
      providerRunId: input.providerRunId,
      answerText: submission.answerText,
      patchUnifiedDiff: submission.patchUnifiedDiff,
      explanation: `${submission.explanation} [platform harness ${kind}; steps=${submission.harnessTrace.steps}]`,
      confidence: submission.confidence,
      claimedRootCause: submission.claimedRootCause ?? undefined,
      filesTouched: submission.filesTouched,
      submittedAt: new Date().toISOString(),
      privacyAttestation,
    });
  } catch (error) {
    await input.orchestrator.recordProviderFailure(input.body.raidId, input.provider.providerId, {
      raidId: input.body.raidId,
      providerId: input.provider.providerId,
      providerRunId: input.providerRunId,
      message: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
    });
  }
}

export function createProviderRunId(): string {
  return `run_${randomUUID()}`;
}
