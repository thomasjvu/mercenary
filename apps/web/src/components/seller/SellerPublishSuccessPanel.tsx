import type { AppRoute } from '../../lib/app-routes.js';

type SellerPublishSuccessPanelProps = {
  publishResult: string;
  onNavigate: (path: AppRoute) => void;
};

export function SellerPublishSuccessPanel({
  publishResult,
  onNavigate,
}: SellerPublishSuccessPanelProps) {
  return (
    <article className="sell-panel sell-panel--success">
      <p className="sell-panel__eyebrow">offers live</p>
      <p className="form-status">{publishResult}</p>
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
    </article>
  );
}
