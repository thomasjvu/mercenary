import { FormInput } from '../system/FormField.js';
import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerOfferPricingStepProps = {
  state: SellerUpstreamOnboardingState;
};

export function SellerOfferPricingStep({ state }: SellerOfferPricingStepProps) {
  const {
    discountPercent,
    setDiscountPercent,
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
  );
}
