import type { DelegationChainEntry } from '@bossraid/shared-types';
import { parseUnits } from 'viem';
import {
  BASE_CHAIN_ID,
  DEFAULT_SUBSCRIPTION_PERIOD_SECONDS,
  DEFAULT_WEEKLY_BUDGET_USD,
  USDC_BASE,
  USDC_BASE_SEPOLIA,
} from './config.js';
import type { RaidSubscriptionGrant } from './types.js';
import type { SmartAccountWalletClient } from './wallet.js';
import { resolveChain } from './wallet.js';

export async function requestRaidSubscription(
  walletClient: SmartAccountWalletClient,
  options: {
    sessionAccount: `0x${string}`;
    weeklyBudgetUsd?: number;
    chainId?: number;
    periodSeconds?: number;
    expiryUnix?: number;
  }
): Promise<RaidSubscriptionGrant> {
  const chain = resolveChain(options.chainId ?? BASE_CHAIN_ID);
  const weeklyBudgetUsd = options.weeklyBudgetUsd ?? DEFAULT_WEEKLY_BUDGET_USD;
  const currentTime = Math.floor(Date.now() / 1_000);
  const expiry = options.expiryUnix ?? currentTime + 60 * 60 * 24 * 30;
  const tokenAddress = chain.id === BASE_CHAIN_ID ? USDC_BASE : USDC_BASE_SEPOLIA;

  const accounts = await walletClient.getAddresses();
  const wallet = accounts[0];
  if (!wallet) {
    throw new Error('Wallet did not return an account.');
  }

  const grantedPermissions = await walletClient.requestExecutionPermissions([
    {
      chainId: chain.id,
      expiry,
      signer: {
        type: 'account',
        data: {
          address: options.sessionAccount,
        },
      },
      isAdjustmentAllowed: false,
      permission: {
        type: 'erc20-token-periodic',
        data: {
          tokenAddress,
          periodAmount: parseUnits(String(weeklyBudgetUsd), 6),
          periodDuration: options.periodSeconds ?? DEFAULT_SUBSCRIPTION_PERIOD_SECONDS,
          startTime: currentTime,
          justification: `Boss Raid account credit: up to ${weeklyBudgetUsd} USDC per week for inference and raid spend.`,
        },
      },
    },
  ]);

  const permission = grantedPermissions[0];
  if (!permission) {
    throw new Error('MetaMask did not return an execution permission.');
  }

  const permissionFrom =
    permission.signer.type === 'account' ? permission.signer.data.address : wallet;
  const permissionContext = permission.context;
  const delegationManager = permission.signerMeta?.delegationManager;

  const grantedAt = new Date().toISOString();
  const delegationChain: DelegationChainEntry[] = [
    {
      type: 'erc7715_grant',
      at: grantedAt,
      from: wallet,
      to: options.sessionAccount,
      summary: `Granted ${weeklyBudgetUsd} USDC weekly account credit to session account.`,
      data: {
        weeklyBudgetUsd,
        periodSeconds: options.periodSeconds ?? DEFAULT_SUBSCRIPTION_PERIOD_SECONDS,
        expiry,
        delegationManager,
      },
    },
  ];

  return {
    wallet,
    sessionAccount: options.sessionAccount,
    permissionFrom,
    permissionContext,
    delegationManager,
    grantedAt,
    expiresAt: new Date(expiry * 1_000).toISOString(),
    weeklyBudgetUsd,
    delegationChain,
  };
}
