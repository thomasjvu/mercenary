import { readSettlementMode } from '@bossraid/constants';

export type SettlementMode = ReturnType<typeof readSettlementMode>;

export function resolveApiSettlementMode(env: NodeJS.ProcessEnv = process.env): SettlementMode {
  return readSettlementMode(env);
}
