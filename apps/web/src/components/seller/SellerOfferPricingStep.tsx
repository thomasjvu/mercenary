import { FormInput } from '../system/FormField.js';
import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerOfferPricingStepProps = {
  state: SellerUpstreamOnboardingState;
};

export function SellerOfferPricingStep({ state }: SellerOfferPricingStepProps) {
  const {
    discountPercent,
    setDiscountPercent,
    offerLane,
    setOfferLane,
    buyerPercent,
    payoutWallet,
    setPayoutWallet,
    session,
  } = state;

  return (
    <div className="sell-form-row">
      <div className="sell-form-row__lead">
        <span aria-hidden="true" className="sell-form-row__mark">
          ○
        </span>
        <strong>Set pricing &amp; lane</strong>
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
      <div className="sell-lane-toggle" role="group" aria-label="Offer lane">
        <button
          className={`sell-lane-toggle__btn${offerLane === 'chat' ? ' is-active' : ''}`}
          onClick={() => setOfferLane('chat')}
          type="button"
        >
          <span className="sell-lane-toggle__title">Chat</span>
          <span className="sell-lane-toggle__hint">Single completion · discount inference</span>
        </button>
        <button
          className={`sell-lane-toggle__btn${offerLane === 'harness' ? ' is-active' : ''}`}
          onClick={() => setOfferLane('harness')}
          type="button"
        >
          <span className="sell-lane-toggle__title">Harness</span>
          <span className="sell-lane-toggle__hint">
            Multi-step tool loop · platform seat (no personal Phala box)
          </span>
        </button>
      </div>
      <p className="quiet-note">
        Buyers pay {buyerPercent}% of reference at {discountPercent}% discount.
        {offerLane === 'harness'
          ? ' Harness offers publish as agent_harness (fresh install) on shared platform seats.'
          : ' Chat offers publish as api_chat single-shot completions.'}
      </p>
    </div>
  );
}
