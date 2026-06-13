import { buildPrivacyComplianceRecord } from '@bossraid/privacy-engine';
import type {
  ProviderProfile,
  RaidRecord,
  SettlementExecutionRecord,
} from '@bossraid/shared-types';
import { buildPrivacyFailureSettlementRecord } from './settlement-artifacts.js';
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
  const privacyCompliance =
    privacyMode !== 'off' && privacyConstraints.requirePrivacyFeatures?.length
      ? buildPrivacyComplianceRecord(
          raid.id,
          privacyMode,
          privacyConstraints.requirePrivacyFeatures,
          raid.rankedSubmissions,
          raid.task.sanitizationReport
        )
      : undefined;

  if (privacyCompliance && !privacyCompliance.overallPassed) {
    raid.settlementExecution = buildPrivacyFailureSettlementRecord(raid, privacyCompliance);
    raid.updatedAt = new Date().toISOString();
    await deps.queuePersist();
    return;
  }

  const record = await deps.settlementExecutor.execute(
    raid,
    buildSettlementExecuteOptions(raid, deps)
  );
  if (!record) {
    return;
  }

  raid.settlementExecution = record;
  if (privacyCompliance) {
    raid.settlementExecution.privacyCompliance = privacyCompliance;
  }
  raid.updatedAt = new Date().toISOString();
  await deps.queuePersist();
}
