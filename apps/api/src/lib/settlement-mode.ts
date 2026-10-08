import {
  readSettlementMode,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_USDG_ADDRESS,
} from '@bossraid/constants';
import { isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type SettlementMode = ReturnType<typeof readSettlementMode>;

export function isNonzeroAddress(value: string | undefined): boolean {
  return Boolean(value && isAddress(value) && !/^0x0{40}$/iu.test(value));
}

export function isSignerKeyConfigured(value: string | undefined): boolean {
  if (!value || !/^0x[0-9a-f]{64}$/iu.test(value)) return false;
  try {
    privateKeyToAccount(value as `0x${string}`);
    return true;
  } catch {
    return false;
  }
}

export function isRpcUrlConfigured(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isFullOnchainSettlementConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const chainId = Number(env.BOSSRAID_CHAIN_ID);
  const productionRail =
    env.NODE_ENV !== 'production' ||
    (chainId === ROBINHOOD_CHAIN_ID &&
      env.BOSSRAID_TOKEN_ADDRESS?.toLowerCase() === ROBINHOOD_USDG_ADDRESS.toLowerCase());
  return Boolean(
    productionRail &&
    isRpcUrlConfigured(env.BOSSRAID_RPC_URL) &&
    Number.isSafeInteger(chainId) &&
    chainId > 0 &&
    isNonzeroAddress(env.BOSSRAID_REGISTRY_ADDRESS) &&
    isNonzeroAddress(env.BOSSRAID_ESCROW_ADDRESS) &&
    isNonzeroAddress(env.BOSSRAID_BOUNTY_ESCROW_ADDRESS) &&
    isNonzeroAddress(env.BOSSRAID_TOKEN_ADDRESS) &&
    isSignerKeyConfigured(env.BOSSRAID_CLIENT_PRIVATE_KEY) &&
    isNonzeroAddress(env.BOSSRAID_EVALUATOR_ADDRESS)
  );
}

export function isSettlementGateConfigured(
  mode: SettlementMode,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (mode === 'off' || mode === 'file') {
    return true;
  }

  return isFullOnchainSettlementConfigured(env);
}
