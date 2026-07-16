import { buildPrivacyComplianceRecord } from '@bossraid/privacy-engine';
import type {
  ProviderProfile,
  RaidRecord,
  SettlementExecutionRecord,
} from '@bossraid/shared-types';
import {
  artifactFileExists,
  buildArtifactPath,
  buildPrivacyFailureSettlementRecord,
  readArtifactFile,
  settlementRecordFromArtifact,
} from './settlement-artifacts.js';
import type { SettlementExecuteOptions } from './settlement-executor.js';

export type OrchestratorSettlementRunnerDeps = {
  requireRaid: (raidId: string) => RaidRecord;
  providers: Map<string, ProviderProfile>;
  settlementOutputDir?: string;
  settlementExecutor: {
    execute(
      raid: RaidRecord,
      options?: SettlementExecuteOptions
    ): Promise<SettlementExecutionRecord | undefined>;
    resume(
      raid: RaidRecord,
      existing: SettlementExecutionRecord,
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

export function shouldRunSettlement(raid: RaidRecord): boolean {
  if (raid.parentRaidId || raid.status !== 'final') {
    return false;
  }

  const existing = raid.settlementExecution;
  if (!existing) {
    return true;
  }

  if (existing.lifecycleStatus === 'partial' && existing.mode === 'onchain') {
    return true;
  }

  return false;
}

export async function executeSettlement(
  raidId: string,
  deps: OrchestratorSettlementRunnerDeps
): Promise<void> {
  const raid = deps.requireRaid(raidId);
  if (!shouldRunSettlement(raid)) {
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

  if (!raid.settlementExecution && privacyCompliance && !privacyCompliance.overallPassed) {
    raid.settlementExecution = buildPrivacyFailureSettlementRecord(raid, privacyCompliance);
    raid.updatedAt = new Date().toISOString();
    await deps.queuePersist();
    return;
  }

  // Restart recovery: mid-flight artifacts may exist without raid.settlementExecution
  // (only assigned after a full execute returns). Hydrate before execute/resume so
  // we do not start a second onchain settlement.
  if (!raid.settlementExecution?.lifecycleStatus) {
    const recoveredOnEntry = await recoverSettlementRecordFromArtifact(raid, deps, {
      includeTerminal: true,
    });
    if (recoveredOnEntry) {
      raid.settlementExecution = recoveredOnEntry;
      raid.updatedAt = new Date().toISOString();
      await deps.queuePersist();

      if (recoveredOnEntry.lifecycleStatus !== 'partial') {
        return;
      }
    }
  }

  const options = buildSettlementExecuteOptions(raid, deps);
  let record: SettlementExecutionRecord | undefined;

  try {
    // resume is onchain-only; file-mode executors may not implement real resume
    if (
      raid.settlementExecution?.lifecycleStatus === 'partial' &&
      raid.settlementExecution.mode === 'onchain'
    ) {
      record = await deps.settlementExecutor.resume(raid, raid.settlementExecution, options);
    } else {
      record = await deps.settlementExecutor.execute(raid, options);
    }
  } catch (error) {
    const recovered = await recoverSettlementRecordFromArtifact(raid, deps);
    if (recovered) {
      raid.settlementExecution = recovered;
      raid.updatedAt = new Date().toISOString();
      await deps.queuePersist();
    }

    throw error;
  }

  if (!record) {
    const recovered = await recoverSettlementRecordFromArtifact(raid, deps);
    if (recovered) {
      raid.settlementExecution = recovered;
      raid.updatedAt = new Date().toISOString();
      await deps.queuePersist();
    }
    return;
  }

  raid.settlementExecution = record;
  if (privacyCompliance) {
    raid.settlementExecution.privacyCompliance = privacyCompliance;
  }
  raid.updatedAt = new Date().toISOString();
  await deps.queuePersist();
}

async function recoverSettlementRecordFromArtifact(
  raid: RaidRecord,
  deps: OrchestratorSettlementRunnerDeps,
  options: { includeTerminal?: boolean } = {}
): Promise<SettlementExecutionRecord | undefined> {
  if (!deps.settlementOutputDir) {
    return undefined;
  }

  const artifactPath = buildArtifactPath(deps.settlementOutputDir, raid.id);
  if (!(await artifactFileExists(artifactPath))) {
    return undefined;
  }

  const artifact = await readArtifactFile(artifactPath);
  if (!artifact) {
    return undefined;
  }

  if (artifact.lifecycleStatus === 'terminal') {
    return options.includeTerminal
      ? settlementRecordFromArtifact(artifact, artifactPath)
      : undefined;
  }

  // Catch/empty-record recovery only rehydrates non-terminal checkpoints (partial).
  // Entry path may also hydrate synthetic/file completions via includeTerminal.
  if (artifact.lifecycleStatus === 'partial') {
    return settlementRecordFromArtifact(artifact, artifactPath);
  }

  if (options.includeTerminal && artifact.lifecycleStatus === 'synthetic') {
    return settlementRecordFromArtifact(artifact, artifactPath);
  }

  return undefined;
}
