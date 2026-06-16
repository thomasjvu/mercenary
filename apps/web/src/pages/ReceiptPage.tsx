import { ReceiptEmptyState } from '../components/receipt/ReceiptEmptyState.js';
import { ReceiptLoadedDashboard } from '../components/receipt/ReceiptLoadedDashboard.js';
import { ReceiptLoadError } from '../components/receipt/ReceiptLoadError.js';
import { ReceiptPageHero } from '../components/receipt/ReceiptPageHero.js';
import { ReceiptQueryForm } from '../components/receipt/ReceiptQueryForm.js';
import { useReceiptPage } from '../hooks/useReceiptPage.js';
import type { AppRoute } from '../lib/app-routes.js';

type ReceiptPageProps = {
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid' }) => void;
};

export function ReceiptPage({ onNavigate }: ReceiptPageProps) {
  const state = useReceiptPage();
  const hasLoadError = Boolean(state.status.error || state.result.error);
  const showDashboard = Boolean(state.activeQuery && !hasLoadError);

  return (
    <section className="receipt-shell receipt-shell--viewport" id="receipt">
      <ReceiptPageHero onNavigate={onNavigate} state={state} />

      <ReceiptQueryForm
        formError={state.formError}
        onRaidIdChange={state.setRaidIdInput}
        onSubmit={state.handleLoadReceipt}
        onTokenChange={state.setTokenInput}
        raidIdInput={state.raidIdInput}
        tokenInput={state.tokenInput}
      />

      <div className="receipt-shell__body">
        {!state.activeQuery ? <ReceiptEmptyState onNavigate={onNavigate} state={state} /> : null}
        {hasLoadError ? <ReceiptLoadError state={state} /> : null}
        {showDashboard ? <ReceiptLoadedDashboard state={state} /> : null}
      </div>
    </section>
  );
}
