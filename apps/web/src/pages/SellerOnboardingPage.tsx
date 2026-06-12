import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import type { UpstreamProviderId } from '@bossraid/constants';
import { UPSTREAM_PROVIDER_CONFIG } from '@bossraid/constants';
import {
  connectSellerUpstream,
  fetchSellerUpstreamConfig,
  fetchSellerUpstreamModels,
  publishSellerUpstreamOffers,
  UPSTREAM_PROVIDER_LABELS,
  type UpstreamCatalogModel,
} from '../api/seller-upstream.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';
import { ModelPickerModal } from '../components/seller/ModelPickerModal.js';
import { UpstreamTeeVerificationPanel } from '../components/trust/UpstreamTeeVerificationPanel.js';

const PROVIDER_ORDER: UpstreamProviderId[] = ['venice', 'redpill', 'near', 'chutes', 'phala'];

export function SellerOnboardingPage() {
  const { session, status, setStatus, connectWallet, isAuthenticated } = useWalletAuth(
    'Connect wallet in the sidebar before selling inference.'
  );
  const [provider, setProvider] = useState<UpstreamProviderId>('venice');
  const upstreamConfig = useSWR(
    isAuthenticated ? `/v1/seller/upstream/${provider}/config` : null,
    () => fetchSellerUpstreamConfig(provider)
  );

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

  async function handleConnect() {
    if (!apiKey.trim()) {
      setStatus(`Enter your ${UPSTREAM_PROVIDER_LABELS[provider]} API key.`);
      return;
    }

    setPending(true);
    setStatus(`Validating ${UPSTREAM_PROVIDER_LABELS[provider]} key...`);
    try {
      const connected = await connectSellerUpstream(provider, apiKey.trim());
      await upstreamConfig.mutate();
      const modelList = await fetchSellerUpstreamModels(provider);
      setModels(modelList.data);
      setSelectedModelIds(
        modelList.data
          .filter((model) => model.upstreamFound)
          .slice(0, 5)
          .map((model) => model.modelId)
      );
      setStatus(
        `Connected ${connected.config.keyPrefix}. ${modelList.upstreamFoundCount} models found on your ${UPSTREAM_PROVIDER_LABELS[provider]} account.`
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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Publish failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="beta-page seller-wizard">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">sell inference</p>
          <h1>Create new offer</h1>
          <p className="lede">
            Connect an upstream TEE provider, pick models, set discount, publish.
          </p>
        </div>
      </header>

      <div className="seller-wizard__steps">
        <WizardStep done={isAuthenticated} title="1 / wallet">
          {isAuthenticated ? (
            <p className="form-status">Signed in as {session?.wallet}.</p>
          ) : (
            <>
              <button
                className="button button--primary"
                onClick={() => void connectWallet()}
                type="button"
              >
                connect wallet
              </button>
              <p className="form-status">{status}</p>
            </>
          )}
        </WizardStep>

        <WizardStep done={Boolean(upstreamConfig.data?.configured)} title="2 / upstream provider">
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
                {UPSTREAM_PROVIDER_LABELS[entry]}
              </button>
            ))}
          </div>
          <p className="lede">{providerConfig.upstreamBase}</p>
          <label className="field">
            <span>{provider} API key</span>
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
        </WizardStep>

        <WizardStep done={selectedModelIds.length > 0} title="3 / model selection">
          <p className="lede">
            {selectedModelIds.length} of {models.length || '…'} models selected for this offer.
          </p>
          <button
            className="button button--primary"
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
        </WizardStep>

        <WizardStep done={false} title="4 / pricing & payout">
          <div className="form-grid">
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
          <p className="form-status">
            A {discountPercent}% discount means buyers pay {buyerPercent}% of the reference rate.
          </p>
        </WizardStep>

        <WizardStep done={Boolean(publishResult)} title="5 / publish">
          <button
            className="button button--primary"
            disabled={!isAuthenticated || pending || selectedModelIds.length === 0}
            onClick={() => void handlePublish()}
            type="button"
          >
            {pending ? 'publishing...' : 'publish offers'}
          </button>
          {publishResult ? <p className="form-status">{publishResult}</p> : null}
          <p className="form-status">{status}</p>
        </WizardStep>
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

function WizardStep({
  title,
  done,
  children,
}: {
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={`beta-panel seller-wizard__step${done ? ' seller-wizard__step--done' : ''}`}
    >
      <p className="eyebrow">{title}</p>
      {children}
    </article>
  );
}
