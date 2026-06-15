import { useCallback, useState } from 'react';
import {
  BASE_CHAIN_ID,
  createPaidFetch,
  encodeDelegationChain,
  requestRaidSubscription,
  type RaidSubscriptionGrant,
  type SmartAccountWalletClient,
} from '@bossraid/smart-pay';
import type { DelegationChainEntry } from '@bossraid/shared-types';
import { fundBuyerBalance } from '../api/auth.js';
import { deleteAgentSession, saveAgentSession } from '../api/smart-pay.js';
import { connectSmartAccountWallet, formatWalletError } from '../lib/ethereum-provider.js';

export function useSmartAccountPay(chainId = BASE_CHAIN_ID) {
  const [walletClient, setWalletClient] = useState<SmartAccountWalletClient | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<RaidSubscriptionGrant | null>(null);
  const [status, setStatus] = useState(
    'Connect MetaMask to subscribe and top up prepaid account credit.'
  );
  const [busy, setBusy] = useState(false);

  const connectWallet = useCallback(async () => {
    setBusy(true);
    try {
      const { client, address } = await connectSmartAccountWallet(chainId);
      setWalletClient(client);
      setWalletAddress(address);
      setStatus(
        `Connected ${address}. Start a weekly subscription to top up credit for inference and raids.`
      );
      return client;
    } catch (error) {
      setStatus(formatWalletError(error));
      return null;
    } finally {
      setBusy(false);
    }
  }, [chainId]);

  const grantSubscription = useCallback(async () => {
    const client = walletClient ?? (await connectWallet());
    if (!client || !walletAddress) {
      return null;
    }

    setBusy(true);
    try {
      const grant = await requestRaidSubscription(client, {
        sessionAccount: walletAddress as `0x${string}`,
        chainId,
      });
      setSubscription(grant);
      await saveAgentSession({
        sessionAccount: grant.sessionAccount,
        permissionFrom: grant.permissionFrom,
        permissionContext: grant.permissionContext,
        expiresAt: grant.expiresAt,
        weeklyBudgetUsd: grant.weeklyBudgetUsd,
      });
      const funded = await fundBuyerBalance(grant.weeklyBudgetUsd);
      setStatus(
        `Subscribed at $${grant.weeklyBudgetUsd.toFixed(2)} USDC/week. Credited $${funded.creditedUsd.toFixed(2)} — balance now $${funded.balanceUsd.toFixed(2)}.`
      );
      return grant;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Subscription grant failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [chainId, connectWallet, walletAddress, walletClient]);

  const clearSubscription = useCallback(async () => {
    await deleteAgentSession();
    setSubscription(null);
    setStatus('Cleared stored agent payment session.');
  }, []);

  const createFetchWithPayment = useCallback(async () => {
    const client = walletClient ?? (await connectWallet());
    if (!client) {
      throw new Error('Connect MetaMask before launching a paid raid.');
    }

    const delegationChain: DelegationChainEntry[] = [
      ...(subscription?.delegationChain ?? []),
      ...(subscription
        ? [
            {
              type: 'erc7710_redelegation' as const,
              at: new Date().toISOString(),
              from: subscription.permissionFrom,
              to: subscription.sessionAccount,
              summary: 'Open redelegation for x402 raid payment.',
            },
          ]
        : [
            {
              type: 'erc7710_delegation' as const,
              at: new Date().toISOString(),
              from: walletAddress ?? undefined,
              summary: 'Direct ERC-7710 delegation for one-shot raid payment.',
            },
          ]),
    ];

    return createPaidFetch(client, {
      chainId,
      sessionAccount: (subscription?.sessionAccount ?? walletAddress) as `0x${string}` | undefined,
      permissionContext: subscription?.permissionContext,
      permissionFrom: subscription?.permissionFrom as `0x${string}` | undefined,
      delegationManager: subscription?.delegationManager as `0x${string}` | undefined,
      delegationChain,
    });
  }, [chainId, connectWallet, subscription, walletAddress, walletClient]);

  return {
    walletAddress,
    subscription,
    status,
    busy,
    connectWallet,
    grantSubscription,
    clearSubscription,
    createFetchWithPayment,
    encodeDelegationChain,
  };
}
