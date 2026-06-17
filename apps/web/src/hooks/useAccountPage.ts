import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { AppRoute } from '../lib/app-routes.js';
import {
  deleteBuyerApiKey,
  deleteSession,
  fetchBuyerPurchases,
  fetchSellerStats,
  fetchSession,
  listSellerProviders,
  updateSellerProvider,
  verifySellerProvider,
} from '../api';
import { removeSavedBuyerApiKey } from '../lib/buyer-api-key-vault.js';
import { buildApiUrl } from '../api/client.js';
import { fetchReady } from '../api/health.js';
import { useBuyerApiKeyCreate } from './useBuyerApiKeyCreate.js';
import { useSmartAccountPay } from './useSmartAccountPay.js';

export const ACCOUNT_TABS = [
  { id: 'wallet', label: 'wallet' },
  { id: 'buyer', label: 'buyer' },
  { id: 'seller', label: 'seller' },
] as const;

export type AccountTabId = (typeof ACCOUNT_TABS)[number]['id'];

type UseAccountPageOptions = {
  onNavigate: (path: AppRoute) => void;
};

export function useAccountPage({ onNavigate }: UseAccountPageOptions) {
  const [activeTab, setActiveTab] = useState<AccountTabId>('wallet');
  const session = useSWR('/v1/session', fetchSession);

  useEffect(() => {
    if (session.isLoading || session.data?.authenticated) {
      return;
    }

    onNavigate('/');
  }, [onNavigate, session.data?.authenticated, session.isLoading]);

  const sellers = useSWR(
    session.data?.authenticated ? '/v1/seller/providers' : null,
    listSellerProviders
  );
  const sellerStats = useSWR(
    session.data?.authenticated ? '/v1/seller/stats' : null,
    fetchSellerStats
  );
  const purchases = useSWR(session.data?.authenticated ? '/v1/buyer/purchases' : null, () =>
    fetchBuyerPurchases(20)
  );
  const [fundAmount, setFundAmount] = useState('10');
  const [fundStatus, setFundStatus] = useState('');
  const [sellerActionStatus, setSellerActionStatus] = useState<Record<string, string>>({});
  const smartPay = useSmartAccountPay();
  const keyCreate = useBuyerApiKeyCreate({
    defaultName: 'Account API key',
    onCreated: async () => {
      await session.mutate();
    },
  });

  async function revokeKey(keyId: string) {
    await deleteBuyerApiKey(keyId);
    removeSavedBuyerApiKey(keyId);
    await session.mutate();
  }

  async function signOut() {
    await deleteSession();
    await session.mutate();
  }

  async function topUpBalance() {
    const amountUsd = Number(fundAmount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setFundStatus('Enter a positive USD amount.');
      return;
    }

    setFundStatus('Processing balance top-up...');
    try {
      const ready = await fetchReady();
      if (!ready.payment.enabled) {
        setFundStatus('Payments are not configured on this API host. Top-ups require x402.');
        return;
      }

      if (!smartPay.walletAddress) {
        setFundStatus('Connect MetaMask before topping up.');
        return;
      }

      const paidFetch = await smartPay.createFetchWithPayment();
      const response = await paidFetch(buildApiUrl('/v1/buyer/balance/fund'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountUsd }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        creditedUsd?: number;
        balanceUsd?: number;
        payment?: { transaction?: string; payer?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.message ?? `Balance top-up failed (${response.status}).`);
      }

      await session.mutate();
      const txNote = body?.payment?.transaction ? ` Tx ${body.payment.transaction}.` : '';
      setFundStatus(
        `Credited $${(body?.creditedUsd ?? amountUsd).toFixed(2)}. New balance $${(body?.balanceUsd ?? 0).toFixed(2)}.${txNote}`
      );
    } catch (error) {
      setFundStatus(error instanceof Error ? error.message : 'Balance top-up failed.');
    }
  }

  async function refreshSellerData() {
    await Promise.all([sellers.mutate(), sellerStats.mutate()]);
  }

  async function toggleOffer(providerId: string, currentStatus: 'active' | 'paused' = 'active') {
    const nextStatus = currentStatus === 'paused' ? 'active' : 'paused';
    setSellerActionStatus((current) => ({ ...current, [providerId]: 'updating offer...' }));

    try {
      await updateSellerProvider(providerId, { marketplaceOfferStatus: nextStatus });
      await refreshSellerData();
      setSellerActionStatus((current) => ({ ...current, [providerId]: `offer ${nextStatus}` }));
    } catch (error) {
      setSellerActionStatus((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : 'offer update failed',
      }));
    }
  }

  async function verifyProvider(providerId: string) {
    setSellerActionStatus((current) => ({ ...current, [providerId]: 'verifying...' }));

    try {
      const result = await verifySellerProvider(providerId);
      await refreshSellerData();
      setSellerActionStatus((current) => ({
        ...current,
        [providerId]: `verification ${result.provider.verification?.status ?? 'pending'}`,
      }));
    } catch (error) {
      setSellerActionStatus((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : 'verification failed',
      }));
    }
  }

  const apiKeys = session.data?.account?.apiKeys ?? [];
  const purchaseRows = purchases.data?.data ?? [];
  const sellerRows = sellers.data?.data ?? [];

  return {
    activeTab,
    setActiveTab,
    session,
    sellers,
    sellerStats,
    purchases,
    fundAmount,
    setFundAmount,
    fundStatus,
    sellerActionStatus,
    smartPay,
    keyCreate,
    apiKeys,
    purchaseRows,
    sellerRows,
    revokeKey,
    signOut,
    topUpBalance,
    toggleOffer,
    verifyProvider,
  };
}

export type AccountPageState = ReturnType<typeof useAccountPage>;
