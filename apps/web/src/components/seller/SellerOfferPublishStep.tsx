import { FormStatus } from '../system/FormField.js';
import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerOfferPublishStepProps = {
  state: SellerUpstreamOnboardingState;
};

export function SellerOfferPublishStep({ state }: SellerOfferPublishStepProps) {
  const {
    isAuthenticated,
    connectWallet,
    pending,
    selectedModelIds,
    offerLane,
    handlePublish,
    publishResult,
    status,
  } = state;

  const publishLabel = offerLane === 'harness' ? 'publish harness seats' : 'publish chat offers';

  return (
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
          {pending ? 'publishing...' : publishLabel}
        </button>
      )}
      <p className="quiet-note">
        First success path: connect key → pick 1–3 models → publish chat. Buyers resend full message
        history for multi-turn; the platform does not store threads.
      </p>
      {publishResult ? <FormStatus>{publishResult}</FormStatus> : null}
      {status ? <FormStatus>{status}</FormStatus> : null}
    </div>
  );
}
