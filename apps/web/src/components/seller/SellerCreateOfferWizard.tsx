import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';
import { SellerOfferModelsStep } from './SellerOfferModelsStep.js';
import { SellerOfferPricingStep } from './SellerOfferPricingStep.js';
import { SellerOfferProviderStep } from './SellerOfferProviderStep.js';
import { SellerOfferPublishStep } from './SellerOfferPublishStep.js';

type SellerCreateOfferWizardProps = {
  state: SellerUpstreamOnboardingState;
};

export function SellerCreateOfferWizard({ state }: SellerCreateOfferWizardProps) {
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

      <SellerOfferProviderStep state={state} />
      <SellerOfferModelsStep state={state} />
      <SellerOfferPricingStep state={state} />
      <SellerOfferPublishStep state={state} />
    </article>
  );
}
