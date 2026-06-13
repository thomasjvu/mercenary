import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { readProviderPrivacyFeatures } from '@bossraid/raid-core';
import {
  computeTrustScore,
  erc8004IdentityIsRegistered,
  providerHasErc8004Identity,
} from '@bossraid/provider-registry';
import type {
  Erc8004Identity,
  Erc8004Verification,
  OutputType,
  ProviderProfile,
  SupportedLanguage,
} from '@bossraid/shared-types';

export interface BossRaidAgentManifest {
  schemaVersion: 'bossraid-agent-manifest/v1';
  generatedAt: string;
  agent: {
    id: 'mercenary-v1';
    name: 'Mercenary';
    platform: 'Boss Raid';
    description: string;
    identity: {
      erc8004Configured: boolean;
      agentId: string | null;
      operatorWallet: string | null;
      registrationTx: string | null;
      identityRegistry: string | null;
      reputationRegistry: string | null;
      validationRegistry: string | null;
      agentRegistry?: string | null;
      agentUri?: string | null;
      verificationStatus?: Erc8004Verification['status'] | null;
      verificationCheckedAt?: string | null;
      status: 'registered' | 'unconfigured';
    };
  };
  endpoints: {
    nativeRaid: 'POST /v1/raid';
    compatibleChat: 'POST /v1/chat/completions';
    manifest: 'GET /v1/agent.json';
    agentLogTemplate: 'GET /v1/raid/:raidId/agent_log.json?token=<raidAccessToken>';
    publicReceiptTemplate: '/receipt?raidId=<raidId>&token=<raidAccessToken>';
    mcpTools: string[];
  };
  capabilities: {
    taskCategories: string[];
    outputTypes: OutputType[];
    tools: string[];
    techStack: string[];
    supportedHosts: Array<'codex' | 'claude_code'>;
    supportedLanguages: SupportedLanguage[];
  };
  computeConstraints: {
    providerTransport: 'http';
    runtimeExecutionRequested: boolean;
    runtimeExecutionEnabled: boolean;
    evaluatorTransport: string;
    workerIsolation: 'per_job_process' | 'per_job_container';
    maxEvaluatorJobs: number;
    teeAttested: boolean;
    teeWalletAddress: string | null;
  };
  providerPool: {
    totalProviders: number;
    providerIds: string[];
    specializations: string[];
    modelFamilies: string[];
    privacyFeatures: string[];
    erc8004RegisteredProviders: number;
    erc8004VerifiedProviders: number;
    trustScoredProviders: number;
    averageTrustScore: number;
  };
  notes: string[];
}

export function buildAgentManifest(
  orchestrator: BossRaidOrchestrator,
  options: {
    runtimeExecutionRequested: boolean;
    runtimeExecutionEnabled: boolean;
    evaluatorTransport: string;
    workerIsolation: 'per_job_process' | 'per_job_container';
    maxEvaluatorJobs: number;
    teeWalletAddress: string | null;
    mercenaryIdentity?: Erc8004Identity;
  }
): BossRaidAgentManifest {
  const providers = orchestrator.listProviders();
  const mercenaryIdentity = options.mercenaryIdentity;
  const mercenaryRegistered = erc8004IdentityIsRegistered(mercenaryIdentity);
  const verifiedProviders = providers.filter(
    (provider) => provider.erc8004?.verification?.status === 'verified'
  );
  const providerTrustScores = providers
    .map((provider) => computeTrustScore(provider))
    .filter((score) => score > 0);
  return {
    schemaVersion: 'bossraid-agent-manifest/v1',
    generatedAt: new Date().toISOString(),
    agent: {
      id: 'mercenary-v1',
      name: 'Mercenary',
      platform: 'Boss Raid',
      description:
        'Mercenary is the Boss Raid orchestrator agent. It turns one task into scoped specialist workstreams, routes them to HTTP providers, verifies outputs, synthesizes one canonical result, and settles only approved contributors.',
      identity: {
        erc8004Configured: mercenaryRegistered,
        agentId: mercenaryIdentity?.agentId ?? null,
        operatorWallet: mercenaryIdentity?.operatorWallet ?? null,
        registrationTx: mercenaryIdentity?.registrationTx ?? null,
        identityRegistry: mercenaryIdentity?.identityRegistry ?? null,
        reputationRegistry: mercenaryIdentity?.reputationRegistry ?? null,
        validationRegistry: mercenaryIdentity?.validationRegistry ?? null,
        agentRegistry: mercenaryIdentity?.verification?.agentRegistry ?? null,
        agentUri: mercenaryIdentity?.verification?.agentUri ?? null,
        verificationStatus: mercenaryIdentity?.verification?.status ?? null,
        verificationCheckedAt: mercenaryIdentity?.verification?.checkedAt ?? null,
        status: mercenaryRegistered ? 'registered' : 'unconfigured',
      },
    },
    endpoints: {
      nativeRaid: 'POST /v1/raid',
      compatibleChat: 'POST /v1/chat/completions',
      manifest: 'GET /v1/agent.json',
      agentLogTemplate: 'GET /v1/raid/:raidId/agent_log.json?token=<raidAccessToken>',
      publicReceiptTemplate: '/receipt?raidId=<raidId>&token=<raidAccessToken>',
      mcpTools: ['bossraid_delegate', 'bossraid_receipt', 'bossraid_status', 'bossraid_result'],
    },
    capabilities: {
      taskCategories: [
        'code_review',
        'debugging',
        'document_analysis',
        'game_build',
        'multi_agent_coordination',
      ],
      outputTypes: ['text', 'patch', 'json', 'image', 'video', 'bundle'],
      tools: [
        'provider_http_dispatch',
        'evaluator',
        'x402',
        'settlement',
        'mcp',
        'openai_compatible_chat',
      ],
      techStack: ['TypeScript', 'Fastify', 'MCP', 'x402', 'Base', 'EigenCompute'],
      supportedHosts: ['codex', 'claude_code'],
      supportedLanguages: collectSupportedLanguages(providers),
    },
    computeConstraints: {
      providerTransport: 'http',
      runtimeExecutionRequested: options.runtimeExecutionRequested,
      runtimeExecutionEnabled: options.runtimeExecutionEnabled,
      evaluatorTransport: options.evaluatorTransport,
      workerIsolation: options.workerIsolation,
      maxEvaluatorJobs: options.maxEvaluatorJobs,
      teeAttested: options.teeWalletAddress != null,
      teeWalletAddress: options.teeWalletAddress,
    },
    providerPool: {
      totalProviders: providers.length,
      providerIds: providers.map((provider) => provider.providerId),
      specializations: uniqueSorted(providers.flatMap((provider) => provider.specializations)),
      modelFamilies: uniqueSorted(
        providers
          .map((provider) => provider.modelFamily)
          .filter((value): value is string => Boolean(value))
      ),
      privacyFeatures: uniqueSorted(providers.flatMap(readProviderPrivacyFeatures)),
      erc8004RegisteredProviders: providers.filter((provider) =>
        providerHasErc8004Identity(provider)
      ).length,
      erc8004VerifiedProviders: verifiedProviders.length,
      trustScoredProviders: providerTrustScores.length,
      averageTrustScore:
        providerTrustScores.length > 0
          ? Math.round(
              providerTrustScores.reduce((total, score) => total + score, 0) /
                providerTrustScores.length
            )
          : 0,
    },
    notes: [
      'This manifest is generated from the live Boss Raid runtime and provider registry.',
      mercenaryRegistered
        ? 'Mercenary ERC-8004 identity is configured and exposed as a load-bearing routing proof.'
        : 'Mercenary ERC-8004 identity remains unconfigured until real onchain registration is wired.',
      mercenaryIdentity?.verification
        ? `Mercenary ERC-8004 verification status: ${mercenaryIdentity.verification.status}.`
        : 'Mercenary ERC-8004 onchain verification is disabled.',
      'Use the per-raid agent_log.json route to inspect one autonomous run end to end.',
    ],
  };
}

function collectSupportedLanguages(providers: ProviderProfile[]): SupportedLanguage[] {
  return uniqueSorted(
    providers.flatMap((provider) => provider.supportedLanguages)
  ) as SupportedLanguage[];
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.length > 0))),
  ].sort();
}
