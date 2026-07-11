import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import type { UpstreamProviderId } from '@bossraid/constants';
import { UPSTREAM_PROVIDER_CONFIG } from '@bossraid/constants';
import {
  connectSellerUpstream,
  fetchSellerUpstreamCatalogModels,
  fetchSellerUpstreamConfig,
  fetchSellerUpstreamModels,
  fetchSellerUpstreamStatus,
  publishSellerUpstreamOffers,
  upstreamProviderLabel,
  type UpstreamCatalogModel,
} from '../api/seller-upstream.js';
import { fetchSellerStats } from '../api/auth.js';
import { useWalletAuth } from './useWalletAuth.js';

export const SELLER_PROVIDER_ORDER: UpstreamProviderId[] = [
  'xai',
  'venice',
  'redpill',
  'near',
  'chutes',
  'phala',
];

export function useSellerUpstreamOnboarding() {
  const { session, status, setStatus, connectWallet, isAuthenticated } = useWalletAuth(
    'Connect wallet in the sidebar before selling inference.'
  );
  const [provider, setProvider] = useState<UpstreamProviderId>('venice');
  const catalogModels = useSWR(`/v1/seller/upstream/${provider}/models/catalog`, () =>
    fetchSellerUpstreamCatalogModels(provider)
  );
  const upstreamConfig = useSWR(
    isAuthenticated ? `/v1/seller/upstream/${provider}/config` : null,
    () => fetchSellerUpstreamConfig(provider)
  );
  const upstreamStatus = useSWR(
    isAuthenticated ? '/v1/seller/upstream/status' : null,
    fetchSellerUpstreamStatus
  );
  const sellerStats = useSWR(isAuthenticated ? '/v1/seller/stats' : null, fetchSellerStats);

  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<UpstreamCatalogModel[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [discountPercent, setDiscountPercent] = useState('40');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  useEffect(() => {
    if (catalogModels.data?.data) {
      setModels(catalogModels.data.data);
    }
  }, [catalogModels.data, provider]);

  const buyerPercent = Math.max(0, 100 - (Number(discountPercent) || 0));
  const providerConfig = UPSTREAM_PROVIDER_CONFIG[provider];
  const previewModelId = selectedModelIds[0];
  const previewModel = models.find((model) => model.modelId === previewModelId);
  const activeOffers = sellerStats.data?.providers.filter(
    (entry) => entry.marketplaceOfferStatus === 'active'
  );

  const demandByModel = sellerStats.data?.modelDemand ?? [];
  const maxDemandValue = useMemo(
    () => Math.max(...demandByModel.map((entry) => entry.routedValue24hUsd), 0.0001),
    [demandByModel]
  );

  async function handleConnect() {
    if (!apiKey.trim()) {
      setStatus(`Enter your ${upstreamProviderLabel(provider)} API key.`);
      return;
    }

    setPending(true);
    setStatus(`Validating ${upstreamProviderLabel(provider)} key...`);
    try {
      const connected = await connectSellerUpstream(provider, apiKey.trim());
      await upstreamConfig.mutate();
      await upstreamStatus.mutate();
      const modelList = await fetchSellerUpstreamModels(provider);
      setModels(modelList.data);
      setSelectedModelIds(
        modelList.data
          .filter((model) => model.upstreamFound)
          .slice(0, 5)
          .map((model) => model.modelId)
      );
      setStatus(
        `Connected ${connected.config.keyPrefix}. ${modelList.upstreamFoundCount} models found on your ${upstreamProviderLabel(provider)} account.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upstream connect failed.');
    } finally {
      setPending(false);
    }
  }

  async function handlePublish() {
    if (selectedModelIds.length === 0) {
      setStatus('Select at least one model.');
      return;
    }

    setPending(true);
    setStatus('Publishing offers...');
    setPublishResult(null);
    try {
      const result = await publishSellerUpstreamOffers(provider, {
        modelIds: selectedModelIds,
        discountPercent: Number(discountPercent) || 0,
        payoutWallet: payoutWallet.trim() || session?.wallet,
      });
      setPublishResult(
        `Published ${result.providers.length} offer${result.providers.length === 1 ? '' : 's'}.`
      );
      setStatus('Offers are live on the marketplace.');
      await sellerStats.mutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Publish failed.');
    } finally {
      setPending(false);
    }
  }

  function handleProviderChange(nextProvider: UpstreamProviderId) {
    setProvider(nextProvider);
    setSelectedModelIds([]);
  }

  return {
    session,
    status,
    connectWallet,
    isAuthenticated,
    provider,
    setProvider: handleProviderChange,
    catalogModels,
    upstreamConfig,
    upstreamStatus,
    sellerStats,
    apiKey,
    setApiKey,
    models,
    selectedModelIds,
    setSelectedModelIds,
    discountPercent,
    setDiscountPercent,
    payoutWallet,
    setPayoutWallet,
    pickerOpen,
    setPickerOpen,
    pending,
    publishResult,
    buyerPercent,
    providerConfig,
    previewModel,
    activeOffers,
    demandByModel,
    maxDemandValue,
    handleConnect,
    handlePublish,
  };
}

export type SellerUpstreamOnboardingState = ReturnType<typeof useSellerUpstreamOnboarding>;
