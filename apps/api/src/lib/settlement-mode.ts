import { readSettlementMode } from '@bossraid/constants';

export type SettlementMode = ReturnType<typeof readSettlementMode>;

export function resolveApiSettlementMode(env: NodeJS.ProcessEnv = process.env): SettlementMode {
  return readSettlementMode(env);
}

export function isSettlementGateConfigured(
  mode: SettlementMode,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (mode === 'off' || mode === 'file') {
    return true;
  }

  return Boolean(
    env.BOSSRAID_RPC_URL && env.BOSSRAID_REGISTRY_ADDRESS && env.BOSSRAID_ESCROW_ADDRESS
  );
}
