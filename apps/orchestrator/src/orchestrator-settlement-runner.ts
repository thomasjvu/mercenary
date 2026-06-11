import { buildPrivacyComplianceRecord } from '@bossraid/privacy-engine';
import type {
  ProviderProfile,
  RaidRecord,
  SettlementExecutionRecord,
} from '@bossraid/shared-types';
import type { SettlementExecuteOptions } from './settlement-executor.js';

export type OrchestratorSettlementRunnerDeps = {
  requireRaid: (raidId: string) => RaidRecord;
  providers: Map<string, ProviderProfile>;
  settlementExecutor: {
    execute(
      raid: RaidRecord,
      options?: SettlementExecuteOptions
    ): Promise<SettlementExecutionRecord | undefined>;
  };
  queuePersist: () => Promise<void>;
};

export function buildSettlementExecuteOptions(
  raid: RaidRecord,
  deps: Pick<OrchestratorSettlementRunnerDeps, 'providers'>
): SettlementExecuteOptions {
  const providerAddressMap: Record<string, string> = {};
  for (const providerId of raid.selectedProviders) {
    const operatorWallet = deps.providers.get(providerId)?.erc8004?.operatorWallet?.trim();
    if (operatorWallet) {
      providerAddressMap[providerId] = operatorWallet;
    }
  }

  return { providerAddressMap };
}

export async function executeSettlement(
  raidId: string,
  deps: OrchestratorSettlementRunnerDeps
): Promise<void> {
  const raid = deps.requireRaid(raidId);
  if (raid.parentRaidId || raid.settlementExecution || raid.status !== 'final') {
    return;
  }

  const privacyConstraints = raid.task.constraints;
  const privacyMode = privacyConstraints.privacyMode ?? 'off';
  if (privacyMode !== 'off' && privacyConstraints.requirePrivacyFeatures?.length) {
    const complianceRecord = buildPrivacyComplianceRecord(
      raid.id,
      privacyMode,
      privacyConstraints.requirePrivacyFeatures,
      raid.rankedSubmissions,
      raid.task.sanitizationReport
    );
    if (!complianceRecord.overallPassed) {
      raid.settlementExecution = {
        mode: 'file',
        proofStandard: 'erc8183_aligned',
        lifecycleStatus: 'synthetic',
        executedAt: new Date().toISOString(),
        artifactPath: '',
        registryRaidRef: raid.id,
        taskHash: '',
        evaluationHash: '',
        successfulProviderIds: [],
        privacyCompliance: complianceRecord,
        allocations: [],
        contracts: {
          registryAddress: null,
          escrowAddress: null,
          tokenAddress: null,
          clientAddress: null,
          evaluatorAddress: null,
          chainId: null,
          rpcUrl: null,
        },
        registryCall: {
          method: 'finalizeRaid',
          args: [raid.id, '0x0000000000000000000000000000000000000000'],
        },
        childJobs: [],
        warnings: ['privacy-compliance-failed'],
      };
      raid.updatedAt = new Date().toISOString();
      await deps.queuePersist();
      return;
    }
  }

  const record = await deps.settlementExecutor.execute(
    raid,
    buildSettlementExecuteOptions(raid, deps)
  );
  if (!record) {
    return;
  }

  raid.settlementExecution = record;
  if (privacyMode !== 'off' && privacyConstraints.requirePrivacyFeatures?.length) {
    const complianceRecord = buildPrivacyComplianceRecord(
      raid.id,
      privacyMode,
      privacyConstraints.requirePrivacyFeatures,
      raid.rankedSubmissions,
      raid.task.sanitizationReport
    );
    raid.settlementExecution.privacyCompliance = complianceRecord;
  }
  raid.updatedAt = new Date().toISOString();
  await deps.queuePersist();
}
