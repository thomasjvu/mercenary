import { ReceiptLoadedDashboard } from '../components/receipt/ReceiptLoadedDashboard.js';
import { ReceiptLoadError } from '../components/receipt/ReceiptLoadError.js';
import { ReceiptQueryForm } from '../components/receipt/ReceiptQueryForm.js';
import { VerificationBackdrop } from '../components/receipt/VerificationBackdrop.js';
import { useReceiptPage } from '../hooks/useReceiptPage.js';

export function ReceiptPage() {
  const state = useReceiptPage();
  const hasLoadError = Boolean(state.status.error || state.result.error);
  const showDashboard = Boolean(state.activeQuery && !hasLoadError);

  return (
    <section
      className={`verification-page${showDashboard ? ' verification-page--loaded' : ''}`}
      id="receipt"
    >
      <VerificationBackdrop />

      <div className="verification-page__content">
        <div className="verification-terminal verification-terminal--sleek">
          <article className="verification-terminal__window">
            <ReceiptQueryForm
              compact
              formError={state.formError}
              onRaidIdChange={state.setRaidIdInput}
              onSubmit={state.handleLoadReceipt}
              onTokenChange={state.setTokenInput}
              raidIdInput={state.raidIdInput}
              terminal={!showDashboard}
              tokenInput={state.tokenInput}
            />

            {hasLoadError ? <ReceiptLoadError compact state={state} /> : null}
          </article>
        </div>

        {showDashboard ? (
          <div className="verification-page__results">
            <header className="verification-receipt-bar">
              <div className="verification-receipt-bar__copy">
                <span className="verification-receipt-bar__status">
                  {state.currentReceiptStatus}
                </span>
                <span className="verification-receipt-bar__id">{state.activeQuery?.raidId}</span>
              </div>
              <button
                className="button button--ghost verification-receipt-bar__action"
                disabled={!state.activeQuery}
                onClick={state.handleCopyLink}
                type="button"
              >
                {state.shareCopied ? 'copied' : 'copy link'}
              </button>
            </header>
            <ReceiptLoadedDashboard state={state} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
