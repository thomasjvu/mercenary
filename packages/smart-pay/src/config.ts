export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

export const METAMASK_X402_FACILITATORS = {
  base_mainnet: 'https://tx-sentinel-base-mainnet.dev-api.cx.metamask.io/platform/v2/x402',
  base_sepolia: 'https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402',
} as const;

export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const DEFAULT_WEEKLY_BUDGET_USD = 10;
export const DEFAULT_SUBSCRIPTION_PERIOD_SECONDS = 604_800;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function resolveDelegationManager(override?: `0x${string}`): `0x${string}` {
  if (override) {
    return override;
  }

  const fromEnv =
    typeof process !== 'undefined' ? process.env.BOSSRAID_DELEGATION_MANAGER_ADDRESS : undefined;
  if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) {
    return fromEnv as `0x${string}`;
  }

  return ZERO_ADDRESS;
}
