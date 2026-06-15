import { useMemo, useState } from 'react';
import useSWR from 'swr';
import type { UpstreamProviderId } from '@bossraid/constants';
import { UPSTREAM_PROVIDER_CONFIG } from '@bossraid/constants';
import {
  connectSellerUpstream,
  fetchSellerUpstreamConfig,
  fetchSellerUpstreamModels,
  fetchSellerUpstreamStatus,
  publishSellerUpstreamOffers,
  upstreamProviderLabel,
  type UpstreamCatalogModel,
} from '../api/seller-upstream.js';
import { fetchSellerStats } from '../api/auth.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';
import { ModelPickerModal } from '../components/seller/ModelPickerModal.js';
import { SellerPathSwitcher } from '../components/seller/SellerPathSwitcher.js';
import {
  SellerEarningsPanel,
  SellerLiveMarketPanel,
} from '../components/seller/SellerDashboardPanels.js';
import { UpstreamTeeVerificationPanel } from '../components/trust/UpstreamTeeVerificationPanel.js';
import type { AppRoute } from '../lib/app-routes.js';
import { WalletGate } from '../components/system/WalletGate.js';
import { SegmentBar } from '../components/system/SegmentBar.js';

const PROVIDER_ORDER: UpstreamProviderId[] = ['venice', 'redpill', 'near', 'chutes', 'phala'];

type SellerOnboardingPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function SellerOnboardingPage({ onNavigate }: SellerOnboardingPageProps) {
  const { session, status, setStatus, connectWallet, isAuthenticated } = useWalletAuth(
    'Connect wallet in the sidebar before selling inference.'
  );
  const [provider, setProvider] = useState<UpstreamProviderId>('venice');
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

  const buyerPercent = Math.max(0, 100 - (Number(discountPercent) || 0));
  const providerConfig = UPSTREAM_PROVIDER_CONFIG[provider];
  const previewModelId = selectedModelIds[0];
  const previewModel = models.find((model) => model.modelId === previewModelId);
  const activeOffers = sellerStats.data?.providers.filter(
    (entry) => entry.marketplaceOfferStatus === 'active'
  );

  const demandByModel = useMemo(() => {
    const providers = sellerStats.data?.providers ?? [];
    return providers
      .filter((entry) => entry.modelId)
      .map((entry) => ({
        modelId: entry.modelId as string,
        displayName: entry.displayName,
        offerStatus: entry.marketplaceOfferStatus,
      }))
      .slice(0, 6);
  }, [sellerStats.data?.providers]);

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

  return (
    <section className="beta-page sell-page">
      <header className="sell-page__intro">
        <h1>Sell inference</h1>
        <p className="sell-page__lede">Create offers & earn money</p>
      </header>

      <WalletGate message="Connect wallet before selling inference." />

      <SellerPathSwitcher
        active="upstream"
        onSelectHttp={() => onNavigate('/onboarding/seller/http')}
        onSelectUpstream={() => onNavigate('/onboarding/seller')}
      />

      <div className="sell-dashboard">
        <div className="sell-dashboard__summary">
          <SellerEarningsPanel isAuthenticated={isAuthenticated} />
          <SellerLiveMarketPanel />
        </div>

        <article className="sell-panel sell-panel--create">
          <p className="sell-panel__eyebrow">create new offer</p>

          <div className="sell-form-row sell-form-row--done">
            <div className="sell-form-row__lead">
              <span aria-hidden="true" className="sell-form-row__mark">
                ✓
              </span>
              <strong>What are you selling?</strong>
            </div>
            <span className="sell-form-row__value">Model inference</span>
          </div>

          <div
            className={`sell-form-row${upstreamConfig.data?.configured ? ' sell-form-row--done' : ''}`}
          >
            <div className="sell-form-row__lead">
              <span aria-hidden="true" className="sell-form-row__mark">
                {upstreamConfig.data?.configured ? '✓' : '○'}
              </span>
              <strong>Choose provider</strong>
            </div>
            <div className="sell-form-row__fields">
              <div className="seller-provider-picker">
                {PROVIDER_ORDER.map((entry) => (
                  <button
                    className={`seller-provider-picker__chip${provider === entry ? ' seller-provider-picker__chip--active' : ''}`}
                    key={entry}
                    onClick={() => {
                      setProvider(entry);
                      setModels([]);
                      setSelectedModelIds([]);
                    }}
                    type="button"
                  >
                    {upstreamProviderLabel(entry)}
                  </button>
                ))}
              </div>
              <p className="quiet-note">{providerConfig.upstreamBase}</p>
              <label className="field">
                <span>Provider API key</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="api key"
                  spellCheck={false}
                  type="password"
                  value={apiKey}
                />
              </label>
              {upstreamConfig.data?.configured ? (
                <p className="form-status">
                  Connected {upstreamConfig.data.config?.keyPrefix}. Re-enter key to rotate.
                </p>
              ) : null}
              <button
                className="button button--primary"
                disabled={!isAuthenticated || pending}
                onClick={() => void handleConnect()}
                type="button"
              >
                get models
              </button>
            </div>
          </div>

          <div
            className={`sell-form-row${selectedModelIds.length > 0 ? ' sell-form-row--done' : ''}`}
          >
            <div className="sell-form-row__lead">
              <span aria-hidden="true" className="sell-form-row__mark">
                {selectedModelIds.length > 0 ? '✓' : '○'}
              </span>
              <strong>Select models</strong>
            </div>
            <div className="sell-form-row__fields">
              <p className="quiet-note">
                {selectedModelIds.length} of {models.length || '…'} models selected.
              </p>
              <button
                className="button"
                disabled={models.length === 0}
                onClick={() => setPickerOpen(true)}
                type="button"
              >
                open model picker
              </button>
              {selectedModelIds.length > 0 ? (
                <p className="form-status">{selectedModelIds.slice(0, 6).join(', ')}</p>
              ) : null}
              {previewModel && (previewModel.teeAttested || previewModel.e2ee) ? (
                <UpstreamTeeVerificationPanel
                  compact
                  e2ee={previewModel.e2ee}
                  modelId={previewModel.modelId}
                  provider={provider}
                  teeAttested={previewModel.teeAttested}
                />
              ) : null}
            </div>
          </div>

          <div className="sell-form-row">
            <div className="sell-form-row__lead">
              <span aria-hidden="true" className="sell-form-row__mark">
                ○
              </span>
              <strong>Set pricing</strong>
            </div>
            <div className="sell-form-row__fields sell-form-row__fields--grid">
              <label className="field">
                <span>discount %</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setDiscountPercent(event.target.value)}
                  value={discountPercent}
                />
              </label>
              <label className="field">
                <span>buyer pays % of reference</span>
                <input disabled value={`${buyerPercent}%`} />
              </label>
              <label className="field">
                <span>payout wallet</span>
                <input
                  onChange={(event) => setPayoutWallet(event.target.value)}
                  placeholder={session?.wallet ?? '0x...'}
                  value={payoutWallet}
                />
              </label>
            </div>
            <p className="quiet-note">
              Buyers pay {buyerPercent}% of reference at {discountPercent}% discount.
            </p>
          </div>

          <div className="sell-form-row sell-form-row--publish">
            {!isAuthenticated ? (
              <button
                className="button button--primary"
                onClick={() => void connectWallet()}
                type="button"
              >
                connect wallet
              </button>
            ) : (
              <button
                className="button button--primary"
                disabled={pending || selectedModelIds.length === 0}
                onClick={() => void handlePublish()}
                type="button"
              >
                {pending ? 'publishing...' : 'publish offers'}
              </button>
            )}
            {publishResult ? <p className="form-status">{publishResult}</p> : null}
            <p className="form-status">{status}</p>
          </div>
        </article>

        <article className="sell-panel sell-panel--offers">
          <div className="sell-panel__head-row">
            <p className="sell-panel__eyebrow">view and edit offers</p>
            {activeOffers && activeOffers.length > 0 ? (
              <button
                className="button button--ghost"
                onClick={() => onNavigate('/sell/offers')}
                type="button"
              >
                manage all
              </button>
            ) : null}
          </div>

          {!isAuthenticated ? (
            <div className="sell-empty">
              <strong>Sign in to view offers</strong>
              <p>Connect wallet and create an offer above to start earning.</p>
            </div>
          ) : activeOffers && activeOffers.length > 0 ? (
            <div className="sell-offer-table">
              {activeOffers.map((offer) => (
                <div className="sell-offer-table__row" key={offer.providerId}>
                  <div>
                    <strong>{offer.displayName}</strong>
                    <span>{offer.modelId}</span>
                  </div>
                  <span className={`offer-status offer-status--${offer.marketplaceOfferStatus}`}>
                    {offer.marketplaceOfferStatus}
                  </span>
                  <span>{offer.verificationStatus ?? 'pending'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="sell-empty">
              <strong>No active offers yet</strong>
              <p>Connect upstream, pick models, and publish above to start earning.</p>
            </div>
          )}
        </article>

        {upstreamStatus.data && upstreamStatus.data.providers.length > 0 ? (
          <article className="sell-panel sell-panel--configs">
            <div className="sell-panel__head-row">
              <p className="sell-panel__eyebrow">saved configurations</p>
              <span className="quiet-note">{upstreamStatus.data.providers.length} saved</span>
            </div>
            <div className="sell-config-grid">
              {upstreamStatus.data.providers.map((config) => (
                <button
                  className="sell-config-card"
                  key={config.configId}
                  onClick={() => setProvider(config.provider)}
                  type="button"
                >
                  <strong>{upstreamProviderLabel(config.provider)}</strong>
                  <span>{config.keyPrefix}</span>
                  <span>Saved {new Date(config.updatedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </article>
        ) : null}

        <article className="sell-panel sell-panel--demand">
          <p className="sell-panel__eyebrow">your demand by model</p>
          <p className="quiet-note">
            Routed volume by model for your live offers, sorted by active listings.
          </p>
          {demandByModel.length === 0 ? (
            <div className="sell-empty sell-empty--compact">
              <p>Demand bars appear once offers are live.</p>
            </div>
          ) : (
            <div className="sell-demand-list">
              {demandByModel.map((entry, index) => (
                <div className="sell-demand-list__row" key={entry.modelId}>
                  <div className="sell-demand-list__copy">
                    <strong>{entry.modelId}</strong>
                    <span>{entry.displayName}</span>
                  </div>
                  <SegmentBar segments={20} tone="volume" value={Math.max(18, 100 - index * 14)} />
                  <span className="sell-demand-list__stat">{entry.offerStatus}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        {publishResult ? (
          <article className="sell-panel sell-panel--success">
            <p className="sell-panel__eyebrow">offers live</p>
            <p className="form-status">{publishResult}</p>
            <div className="seller-wizard__summary-actions">
              <button
                className="button button--primary"
                onClick={() => onNavigate('/sell/offers')}
                type="button"
              >
                manage offers
              </button>
              <button className="button" onClick={() => onNavigate('/marketplace')} type="button">
                view marketplace
              </button>
            </div>
          </article>
        ) : null}
      </div>

      {pickerOpen ? (
        <ModelPickerModal
          models={models}
          provider={provider}
          selectedIds={selectedModelIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(modelIds) => {
            setSelectedModelIds(modelIds);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
