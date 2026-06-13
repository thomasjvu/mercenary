import { readSettlementMode } from '@bossraid/constants';

export type SettlementMode = ReturnType<typeof readSettlementMode>;

export function resolveApiSettlementMode(env: NodeJS.ProcessEnv = process.env): SettlementMode {
  return readSettlementMode(env);
}

export function isFullOnchainSettlementConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.BOSSRAID_RPC_URL &&
    env.BOSSRAID_CHAIN_ID &&
    env.BOSSRAID_REGISTRY_ADDRESS &&
    env.BOSSRAID_ESCROW_ADDRESS &&
    env.BOSSRAID_TOKEN_ADDRESS &&
    env.BOSSRAID_CLIENT_PRIVATE_KEY &&
    env.BOSSRAID_EVALUATOR_ADDRESS
  );
}

export function isSettlementGateConfigured(
  mode: SettlementMode,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (mode === 'off' || mode === 'file') {
    return true;
  }

  if (mode === 'onchain') {
    return isFullOnchainSettlementConfigured(env);
  }

  return Boolean(
    env.BOSSRAID_RPC_URL && env.BOSSRAID_REGISTRY_ADDRESS && env.BOSSRAID_ESCROW_ADDRESS
  );
}
