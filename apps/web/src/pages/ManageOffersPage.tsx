import { useState } from 'react';
import useSWR from 'swr';
import type { UpstreamProviderId } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
import {
  listSellerProviders,
  updateSellerProvider,
  verifySellerProvider,
  fetchSession,
} from '../api';
import { pauseSellerUpstreamOffer } from '../api/seller-upstream.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';
import { UpstreamTeeVerificationPanel } from '../components/trust/UpstreamTeeVerificationPanel.js';
import { PageHero } from '../components/system/PageHero.js';
import { WalletGate } from '../components/system/WalletGate.js';

function resolveHostedProvider(
  source: { type?: string; targetType?: string } | undefined
): UpstreamProviderId {
  if (source?.targetType && isUpstreamProviderId(source.targetType)) {
    return source.targetType;
  }
  return 'venice';
}

export function ManageOffersPage() {
  const { isAuthenticated } = useWalletAuth('Connect wallet to manage your offers.');
  const sellers = useSWR(isAuthenticated ? '/v1/seller/providers' : null, listSellerProviders);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

  const hostedOffers = (sellers.data?.data ?? []).filter(
    (provider) =>
      provider.source?.type === 'inference_hosted' || provider.source?.type === 'venice_hosted'
  );

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

  return (
    <section className="beta-page">
      <PageHero
        compact
        eyebrow="sell inference"
        lede="Pause, verify, and remove hosted offers."
        title="Manage my offers"
      />

      <WalletGate />

      {isAuthenticated ? (
        <div className="manage-offers">
          {hostedOffers.length === 0 ? (
            <article className="beta-panel">
              <p>No hosted offers yet. Create one from the sell wizard.</p>
            </article>
          ) : (
            hostedOffers.map((provider) => {
              const upstream = resolveHostedProvider(provider.source);
              return (
                <article className="beta-panel manage-offers__card" key={provider.providerId}>
                  <div className="manage-offers__main">
                    <h2>{provider.displayName}</h2>
                    <p className="manage-offers__meta">
                      {provider.modelId} · {provider.modelProvider ?? upstream}
                    </p>
                    <p className="manage-offers__meta">
                      {provider.pricing?.mode === 'token_metered'
                        ? `$${provider.pricing.pricePer1mInputTokensUsd?.toFixed(3) ?? '0'} / $${provider.pricing.pricePer1mOutputTokensUsd?.toFixed(3) ?? '0'} per M`
                        : `$${provider.pricePerTaskUsd.toFixed(2)} per task`}
                    </p>
                    <p className="manage-offers__meta">
                      status {provider.verification?.status ?? 'pending'} · offer{' '}
                      {provider.marketplaceOfferStatus ?? 'active'}
                    </p>
                    {provider.privacy?.teeAttested || provider.privacy?.e2ee ? (
                      <UpstreamTeeVerificationPanel
                        compact
                        e2ee={provider.privacy?.e2ee}
                        modelId={provider.modelId ?? ''}
                        provider={upstream}
                        sellerId={provider.providerId}
                        teeAttested={provider.privacy?.teeAttested}
                      />
                    ) : null}
                  </div>
                  <div className="manage-offers__actions">
                    <button
                      className="button"
                      onClick={() =>
                        void toggleOffer(
                          provider.providerId,
                          provider.marketplaceOfferStatus ?? 'active'
                        )
                      }
                      type="button"
                    >
                      {provider.marketplaceOfferStatus === 'paused' ? 'resume' : 'pause'}
                    </button>
                    <button
                      className="button"
                      onClick={() => void verifyOffer(provider.providerId)}
                      type="button"
                    >
                      re-verify
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        void removeOffer(provider.modelId, provider.providerId, upstream)
                      }
                      type="button"
                    >
                      remove
                    </button>
                    <p className="form-status">{actionStatus[provider.providerId]}</p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}
