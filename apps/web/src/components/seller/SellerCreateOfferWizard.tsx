import type { UpstreamProviderId } from '@bossraid/constants';
import { upstreamProviderLabel } from '../../api/seller-upstream.js';
import { FormInput, FormSelect, FormStatus } from '../system/FormField.js';
import { UpstreamTeeVerificationPanel } from '../trust/UpstreamTeeVerificationPanel.js';
import {
  SELLER_PROVIDER_ORDER,
  type SellerUpstreamOnboardingState,
} from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerCreateOfferWizardProps = {
  state: SellerUpstreamOnboardingState;
};

export function SellerCreateOfferWizard({ state }: SellerCreateOfferWizardProps) {
  const {
    session,
    status,
    connectWallet,
    isAuthenticated,
    provider,
    setProvider,
    catalogModels,
    upstreamConfig,
    apiKey,
    setApiKey,
    models,
    selectedModelIds,
    discountPercent,
    setDiscountPercent,
    payoutWallet,
    setPayoutWallet,
    pending,
    publishResult,
    buyerPercent,
    providerConfig,
    previewModel,
    setPickerOpen,
    handleConnect,
    handlePublish,
  } = state;

  return (
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
          <FormSelect
            label="Provider"
            onChange={(event) => setProvider(event.target.value as UpstreamProviderId)}
            options={SELLER_PROVIDER_ORDER.map((entry) => [entry, upstreamProviderLabel(entry)])}
            value={provider}
          />
          <p className="quiet-note">{providerConfig.upstreamBase}</p>
          <FormInput
            autoComplete="off"
            label="Provider API key"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="api key"
            spellCheck={false}
            type="password"
            value={apiKey}
          />
          {upstreamConfig.data?.configured ? (
            <FormStatus>
              Connected {upstreamConfig.data.config?.keyPrefix}. Re-enter key to rotate.
            </FormStatus>
          ) : null}
          <button
            className="button button--primary"
            disabled={!isAuthenticated || pending}
            onClick={() => void handleConnect()}
            type="button"
          >
            connect & sync account
          </button>
        </div>
      </div>

      <div className={`sell-form-row${selectedModelIds.length > 0 ? ' sell-form-row--done' : ''}`}>
        <div className="sell-form-row__lead">
          <span aria-hidden="true" className="sell-form-row__mark">
            {selectedModelIds.length > 0 ? '✓' : '○'}
          </span>
          <strong>Select models</strong>
        </div>
        <div className="sell-form-row__fields">
          <p className="quiet-note">
            {selectedModelIds.length} of {models.length || catalogModels.data?.data.length || '…'}{' '}
            models selected.
            {catalogModels.isLoading ? ' Loading catalog...' : null}
          </p>
          <button
            className="button"
            disabled={models.length === 0 && !catalogModels.data}
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            open model picker
          </button>
          {selectedModelIds.length > 0 ? (
            <FormStatus>{selectedModelIds.slice(0, 6).join(', ')}</FormStatus>
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
          <FormInput
            inputMode="decimal"
            label="discount %"
            onChange={(event) => setDiscountPercent(event.target.value)}
            value={discountPercent}
          />
          <FormInput disabled label="buyer pays % of reference" value={`${buyerPercent}%`} />
          <FormInput
            label="payout wallet"
            onChange={(event) => setPayoutWallet(event.target.value)}
            placeholder={session?.wallet ?? '0x...'}
            value={payoutWallet}
          />
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
            className="button button--primary rx-spacebar-clip"
            disabled={pending || selectedModelIds.length === 0}
            onClick={() => void handlePublish()}
            type="button"
          >
            {pending ? 'publishing...' : 'publish offers'}
          </button>
        )}
        {publishResult ? <FormStatus>{publishResult}</FormStatus> : null}
        {status ? <FormStatus>{status}</FormStatus> : null}
      </div>
    </article>
  );
}
