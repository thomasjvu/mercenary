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
    handlePublish,
    publishResult,
    status,
  } = state;

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
          {pending ? 'publishing...' : 'publish offers'}
        </button>
      )}
      {publishResult ? <FormStatus>{publishResult}</FormStatus> : null}
      {status ? <FormStatus>{status}</FormStatus> : null}
    </div>
  );
}
