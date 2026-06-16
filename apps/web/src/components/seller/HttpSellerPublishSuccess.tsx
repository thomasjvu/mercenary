import { FormStatus } from '../system/FormField.js';
import { FlowSection } from '../system/FlowSection.js';
import type { AppRoute } from '../../lib/app-routes.js';

type HttpSellerPublishSuccessProps = {
  providerId: string;
  verificationStatus: string;
  onNavigate: (path: AppRoute) => void;
};

export function HttpSellerPublishSuccess({
  providerId,
  verificationStatus,
  onNavigate,
}: HttpSellerPublishSuccessProps) {
  return (
    <FlowSection className="seller-wizard__summary" done step="done" title="Worker live">
      <FormStatus>
        {providerId} · verification {verificationStatus}
      </FormStatus>
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
    </FlowSection>
  );
}
