import { useState } from 'react';
import useSWR from 'swr';
import {
  fetchSession,
  listSellerProviders,
  updateSellerProvider,
  verifySellerProvider,
} from '../api';
import { useWalletAuth } from './useWalletAuth.js';

export function useManageOffers() {
  const { isAuthenticated } = useWalletAuth('Connect wallet to manage your offers.');
  const sellers = useSWR(isAuthenticated ? '/v1/seller/providers' : null, listSellerProviders);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

  const workerOffers = sellers.data?.data ?? [];

  async function refresh() {
    await Promise.all([sellers.mutate(), fetchSession()]);
  }

  async function toggleOffer(providerId: string, currentStatus: 'active' | 'paused' = 'active') {
    const nextStatus = currentStatus === 'paused' ? 'active' : 'paused';
    setActionStatus((current) => ({ ...current, [providerId]: 'updating...' }));
    try {
      await updateSellerProvider(providerId, { marketplaceOfferStatus: nextStatus });
      await refresh();
      setActionStatus((current) => ({ ...current, [providerId]: nextStatus }));
    } catch (error) {
      setActionStatus((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : 'update failed',
      }));
    }
  }

  async function verifyOffer(providerId: string) {
    setActionStatus((current) => ({ ...current, [providerId]: 'verifying...' }));
    try {
      const result = await verifySellerProvider(providerId);
      await refresh();
      setActionStatus((current) => ({
        ...current,
        [providerId]: result.provider.verification?.status ?? 'pending',
      }));
    } catch (error) {
      setActionStatus((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : 'verify failed',
      }));
    }
  }

  return {
    isAuthenticated,
    workerOffers,
    actionStatus,
    toggleOffer,
    verifyOffer,
  };
}

export type ManageOffersState = ReturnType<typeof useManageOffers>;
