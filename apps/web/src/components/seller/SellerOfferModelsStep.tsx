import { FormStatus } from '../system/FormField.js';
import { UpstreamTeeVerificationPanel } from '../trust/UpstreamTeeVerificationPanel.js';
import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerOfferModelsStepProps = {
  state: SellerUpstreamOnboardingState;
};

export function SellerOfferModelsStep({ state }: SellerOfferModelsStepProps) {
  const { selectedModelIds, models, catalogModels, previewModel, provider, setPickerOpen } = state;

  return (
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
  );
}
