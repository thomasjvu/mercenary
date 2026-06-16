import { useState } from 'react';
import useSWR from 'swr';
import type { UpstreamProviderId } from '@bossraid/constants';
import {
  fetchSession,
  listSellerProviders,
  updateSellerProvider,
  verifySellerProvider,
} from '../api';
import { pauseSellerUpstreamOffer } from '../api/seller-upstream.js';
import { filterHostedInferenceOffers, resolveHostedOfferUpstream } from '../lib/seller-offers.js';
import { useWalletAuth } from './useWalletAuth.js';

export function useManageOffers() {
  const { isAuthenticated } = useWalletAuth('Connect wallet to manage your offers.');
  const sellers = useSWR(isAuthenticated ? '/v1/seller/providers' : null, listSellerProviders);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

  const hostedOffers = filterHostedInferenceOffers(sellers.data?.data ?? []);

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

  async function removeOffer(
    modelId: string | undefined,
    providerId: string,
    upstream: UpstreamProviderId
  ) {
    if (!modelId) {
      return;
    }
    setActionStatus((current) => ({ ...current, [providerId]: 'pausing...' }));
    try {
      await pauseSellerUpstreamOffer(upstream, modelId);
      await refresh();
      setActionStatus((current) => ({ ...current, [providerId]: 'paused' }));
    } catch (error) {
      setActionStatus((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : 'remove failed',
      }));
    }
  }

  return {
    isAuthenticated,
    hostedOffers,
    actionStatus,
    toggleOffer,
    verifyOffer,
    removeOffer,
    resolveHostedOfferUpstream,
  };
}

export type ManageOffersState = ReturnType<typeof useManageOffers>;
