import type { UpstreamProviderId } from '@bossraid/constants';
import { FormInput, FormSelect, FormStatus } from '../system/FormField.js';
import {
  SELLER_PROVIDER_ORDER,
  sellerProviderOptionLabel,
  type SellerUpstreamOnboardingState,
} from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerOfferProviderStepProps = {
  state: SellerUpstreamOnboardingState;
};

export function SellerOfferProviderStep({ state }: SellerOfferProviderStepProps) {
  const {
    upstreamConfig,
    provider,
    setProvider,
    providerConfig,
    apiKey,
    setApiKey,
    isAuthenticated,
    pending,
    handleConnect,
  } = state;

  return (
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
          options={SELLER_PROVIDER_ORDER.map((entry) => [entry, sellerProviderOptionLabel(entry)])}
          value={provider}
        />
        <p className="quiet-note">
          {providerConfig.upstreamBase}
          {provider === 'anthropic'
            ? ' · Direct Anthropic (catalog ids anthropic/*). Venice resale Claude is a different listing.'
            : ''}
        </p>
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
  );
}
