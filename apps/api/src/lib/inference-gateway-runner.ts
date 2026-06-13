import { randomUUID } from 'node:crypto';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { buildPrivacyAttestation } from '@bossraid/privacy-engine';
import type { PrivacyFeatureKey } from '@bossraid/shared-types';
import type { ProviderProfile, ProviderTaskPackage } from '@bossraid/shared-types';
import type { ApiControlState } from '../control-state.js';
import { extractInferencePromptFromTask, probeUpstreamChatCompletion } from './upstream/index.js';
import { probeVeniceE2eeChatCompletion } from './venice-e2ee.js';
import { resolveHostedProviderUpstream } from './inference-gateway-health.js';
import { buildInferenceReceipt, verifyUpstreamTee } from './attestation-service.js';
import { generateAttestationNonce } from './upstream/index.js';
import type { InferenceReceiptStore } from './inference-receipt-store.js';

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
    await input.orchestrator.recordProviderFailure(input.body.raidId, input.body.providerId, {
      raidId: input.body.raidId,
      providerId: input.body.providerId,
      providerRunId: input.providerRunId,
      message: 'inference_hosted seller wallet or upstream missing',
      failedAt: new Date().toISOString(),
    });
    return;
  }

  const upstreamModelId =
    input.provider.pricing?.upstreamModelId ?? input.provider.modelId ?? input.body.providerId;

  try {
    const resolvedApiKey = input.controlState.readSellerUpstreamApiKey(wallet, upstream);
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
      if (teeResult.valid && featuresClaimed.includes('signed_outputs')) {
        featuresVerified.push('signed_outputs');
      }
      if (teeResult.valid && featuresClaimed.includes('no_data_retention')) {
        featuresVerified.push('no_data_retention');
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
        providerId: input.body.providerId,
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
      providerId: input.body.providerId,
      providerRunId: input.providerRunId,
      answerText: chatResult.content,
      explanation: `${upstream} hosted gateway completed ${upstreamModelId}.`,
      confidence: 0.92,
      filesTouched: [],
      submittedAt: new Date().toISOString(),
      privacyAttestation,
    });
  } catch (error) {
    await input.orchestrator.recordProviderFailure(input.body.raidId, input.body.providerId, {
      raidId: input.body.raidId,
      providerId: input.body.providerId,
      providerRunId: input.providerRunId,
      message: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
    });
  }
}

export function createProviderRunId(): string {
  return `run_${randomUUID()}`;
}
