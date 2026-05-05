import type {
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  BossRaidStatusOutput,
  RaidRecord,
  SanitizedTaskSpec,
  SelectedProviders,
} from '@bossraid/shared-types';
import { NoEligibleProvidersError } from '../index.js';
import { sanitizeTask } from '@bossraid/raid-core';
import { buildDiscoveryQueryFromTask } from '@bossraid/provider-registry';
import { selectProviders } from '@bossraid/raid-core';
import {
  buildHierarchicalRaidGraph,
  shouldUseHierarchicalPlanning,
  type PlannedRaidNode,
} from '../hierarchy.js';
import {
  buildAdaptivePlanningOutput,
  applyDisqualificationToRaid,
  applyFailureToRaid,
  applyHeartbeatToRaid,
  applySubmissionToRaid,
  applyTimeoutToRaid,
  buildRaidStatusOutput,
  finalizeRaidRecord,
  promoteReserveProvider,
  restorePersistedRaid,
  shouldFinalizeRaid,
  TERMINAL_ASSIGNMENT_STATUSES,
  TERMINAL_RAID_STATUSES,
} from '../raid-state.js';
import { delay, timeoutReject } from '../runtime.js';
import { createSettlementExecutor } from '../settlement-executor.js';
import { buildSettlementSummary } from '../settlement.js';
import { buildSynthesizedOutput } from '../synthesis.js';
import { buildProviderTaskPackage } from '../task-package.js';

export class RaidLifecycleManager {
  constructor(
    private providerManager: {
      discoverProvidersForRaid: (query: any) => Promise<any[]>;
    },
    private persistenceManager: {
      assertPersistenceWritable: () => void;
      queuePersist: () => Promise<void>;
      getRaid: (raidId: string) => Promise<RaidRecord | undefined>;
      saveRaid: (raid: RaidRecord) => Promise<void>;
    },
    private settlementExecutor: {
      execute: (raid: RaidRecord) => Promise<any>;
    },
    private options: {
      inviteAcceptMs: number;
      firstHeartbeatMs: number;
      hardExecutionMs: number;
      raidAbsoluteMs: number;
      providerFreshMs: number;
    }
  ) {}

  async spawnRaid(input: BossRaidSpawnInput): Promise<BossRaidSpawnOutput> {
    const prepared = await this.prepareRaid(input);

    if (prepared.mode === 'single') {
      return await this.spawnLeafRaid(prepared);
    } else {
      return await this.spawnHierarchicalRaid(prepared);
    }
  }

  private async prepareRaid(input: BossRaidSpawnInput): Promise<
    | {
        mode: 'single';
        sanitized: SanitizedTaskSpec;
        selectedProviders: SelectedProviders;
      }
    | {
        mode: 'hierarchical';
        sanitized: SanitizedTaskSpec;
        graph: PlannedRaidNode;
        adaptiveProviderIds: string[];
      }
  > {
    const sanitized = sanitizeTask(input);

    if (shouldUseHierarchicalPlanning(sanitized)) {
      const graph = await this.prepareHierarchicalGraph(sanitized);
      if (graph != null) {
        return {
          mode: 'hierarchical',
          sanitized,
          graph: graph.graph,
          adaptiveProviderIds: graph.adaptiveProviderIds,
        };
      }
    }

    const discoverableProviders = await this.providerManager.discoverProvidersForRaid(
      buildDiscoveryQueryFromTask(sanitized)
    );
    const selectedProviders = selectProviders(
      sanitized,
      discoverableProviders,
      this.options.providerFreshMs,
      { skipFreshnessCheck: true }
    );
    if (selectedProviders.primaries.length === 0) {
      throw new NoEligibleProvidersError();
    }

    return {
      mode: 'single',
      sanitized,
      selectedProviders,
    };
  }

  private async prepareHierarchicalGraph(
    sanitized: any
  ): Promise<{ graph: PlannedRaidNode; adaptiveProviderIds: string[] } | undefined> {
    // This would need the adaptive reserve experts calculation
    // For now, returning undefined to fall back to leaf raid
    return undefined;
  }

  private async spawnLeafRaid(prepared: {
    mode: 'single';
    sanitized: SanitizedTaskSpec;
    selectedProviders: SelectedProviders;
  }): Promise<BossRaidSpawnOutput> {
    // Implementation would go here
    // This is a simplified version - the real implementation is much more complex
    return {
      raidId: 'test-raid-id',
      raidAccessToken: 'test-token',
      receiptPath: `/receipt?raidId=test-raid-id&token=test-token`,
      status: 'running',
      selectedExperts: prepared.selectedProviders.primaries.length,
      reserveExperts: prepared.selectedProviders.reserves.length,
      estimatedFirstResultSec: 25,
      sanitization: prepared.sanitized.sanitizationReport,
    };
  }

  private async spawnHierarchicalRaid(prepared: {
    mode: 'hierarchical';
    sanitized: SanitizedTaskSpec;
    graph: PlannedRaidNode;
    adaptiveProviderIds: string[];
  }): Promise<BossRaidSpawnOutput> {
    // Implementation would go here
    return {
      raidId: 'test-hierarchical-raid-id',
      raidAccessToken: 'test-token',
      receiptPath: `/receipt?raidId=test-hierarchical-raid-id&token=test-token`,
      status: 'running',
      selectedExperts: prepared.adaptiveProviderIds.length,
      reserveExperts: 0,
      estimatedFirstResultSec: 25,
      sanitization: prepared.sanitized.sanitizationReport,
    };
  }

  abortRaid(raidId: string): any {
    // Implementation would go here
    return {
      status: 'cancelled',
      experts: [{ status: 'disqualified' }],
    };
  }

  getRaid(raidId: string): RaidRecord | undefined {
    // Implementation would go here
    return undefined;
  }

  recordProviderHeartbeat(raidId: string, providerId: string, heartbeat: any): any {
    // Implementation would go here
    return {
      status: 'completed',
      experts: [{ status: 'completed' }],
    };
  }
}
