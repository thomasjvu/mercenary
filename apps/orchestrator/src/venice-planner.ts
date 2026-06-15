import { createVeniceRaidClient, taskUsesVeniceLane } from '@bossraid/venice-client';
import type { RaidRecord, VeniceDirectCallRecord } from '@bossraid/shared-types';

const veniceClient = createVeniceRaidClient();

export function shouldUseVenicePlanner(raid: RaidRecord): boolean {
  return taskUsesVeniceLane(raid.task.constraints);
}

export async function maybePlanRaidWithVenice(raid: RaidRecord): Promise<void> {
  if (!shouldUseVenicePlanner(raid) || !veniceClient.enabled()) {
    return;
  }

  const workstreamHints = raid.contributionPlan
    ? `${raid.contributionPlan.workstreamLabel}: ${raid.contributionPlan.workstreamObjective}`
    : raid.task.taskDescription;

  const result = await veniceClient.chat({
    system:
      'You are Mercenary, the Boss Raid orchestrator. Refine workstream objectives for a multi-agent Venice-backed raid. Return concise bullet objectives only.',
    user: [
      `Task: ${raid.task.taskTitle}`,
      raid.task.taskDescription,
      'Workstreams:',
      workstreamHints,
    ].join('\n\n'),
  });

  const record: VeniceDirectCallRecord = {
    phase: 'plan',
    model: result.model,
    balanceRemainingUsd: result.balanceRemainingUsd,
    at: new Date().toISOString(),
    summary: result.content.slice(0, 500),
  };

  raid.veniceDirectCalls = [...(raid.veniceDirectCalls ?? []), record];
  raid.updatedAt = new Date().toISOString();
}

export async function maybeSynthesizeWithVenice(raid: RaidRecord): Promise<string | undefined> {
  if (!shouldUseVenicePlanner(raid) || !veniceClient.enabled()) {
    return undefined;
  }

  const approved = raid.rankedSubmissions
    .filter((entry) => entry.breakdown.valid)
    .map(
      (entry) =>
        `Provider ${entry.submission.providerId}: ${entry.submission.answerText ?? entry.submission.explanation ?? 'approved contribution'}`
    )
    .join('\n\n');

  if (!approved) {
    return undefined;
  }

  const result = await veniceClient.chat({
    system:
      'You are Mercenary. Merge approved provider outputs into one canonical answer for the Boss Raid receipt.',
    user: [`Task: ${raid.task.taskTitle}`, approved].join('\n\n'),
  });

  const record: VeniceDirectCallRecord = {
    phase: 'synthesize',
    model: result.model,
    balanceRemainingUsd: result.balanceRemainingUsd,
    at: new Date().toISOString(),
    summary: result.content.slice(0, 500),
  };

  raid.veniceDirectCalls = [...(raid.veniceDirectCalls ?? []), record];
  raid.updatedAt = new Date().toISOString();
  return result.content;
}
