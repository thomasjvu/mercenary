import { SettlementProofPanel } from '@bossraid/ui';
import { ReceiptAttestationSection } from './ReceiptAttestationSection.js';
import { ReceiptOutputSection } from './ReceiptOutputSection.js';
import { ReceiptProviderList } from './ReceiptProviderList.js';
import type { ReceiptPageState } from '../../hooks/useReceiptPage.js';

type ReceiptLoadedDashboardProps = {
  state: ReceiptPageState;
};

export function ReceiptLoadedDashboard({ state }: ReceiptLoadedDashboardProps) {
  const { activeQuery } = state;
  if (!activeQuery) {
    return null;
  }

  return (
    <section className="receipt-dashboard receipt-dashboard--compact">
      <ReceiptOutputSection
        approvedSubmissionCount={state.approvedSubmissionCount}
        compact
        currentReceiptStatus={state.currentReceiptStatus}
        result={state.result.data}
      />

      <div className="receipt-dashboard__folds">
        <details className="receipt-fold" open>
          <summary className="receipt-fold__summary">
            <span>Providers</span>
            <span className="receipt-fold__count">{state.providerRows.length}</span>
          </summary>
          <div className="receipt-fold__body">
            <ReceiptProviderList compact rows={state.providerRows} />
          </div>
        </details>

        <details className="receipt-fold">
          <summary className="receipt-fold__summary">
            <span>Proof</span>
            <span className="receipt-fold__count">{state.routedProviderIds.length} routed</span>
          </summary>
          <div className="receipt-fold__body">
            <ReceiptAttestationSection
              activeQuery={activeQuery}
              attestedResult={state.attestedResult.data}
              hostAttestation={state.hostAttestation.data}
              attestationSurfaceLabel={state.attestationSurfaceLabel}
              attestationTarget={state.attestationTarget}
              attestationTee={state.attestationTee}
              compact
              resultAttestationStatus={state.resultAttestationStatus}
              resultSignerDisabled={state.resultSignerDisabled}
              routedProviderCount={state.routedProviderIds.length}
              runtimeAttestationStatus={state.runtimeAttestationStatus}
              runtimeSignerDisabled={state.runtimeSignerDisabled}
              settlementExecution={state.settlementExecution}
              signedProviderCount={state.signedProviderCount}
              teeProviderCount={state.teeProviderCount}
              upstreamAttestations={state.upstreamAttestations}
            />
          </div>
        </details>

        <details className="receipt-fold" open>
          <summary className="receipt-fold__summary">
            <span>Settlement</span>
            <span className="receipt-fold__count">{state.successfulProviderCount} paid</span>
          </summary>
          <div className="receipt-fold__body">
            <SettlementProofPanel
              activeRaidId={activeQuery.raidId}
              approvedProviderCount={state.approvedSubmissionCount}
              erc8004ProviderCount={state.erc8004ProviderCount}
              payoutPerSuccessfulProvider={state.payoutPerSuccessfulProvider}
              reputationEvents={state.reputationEvents}
              resultStatus={state.currentReceiptStatus}
              routingProof={state.routingProof}
              routedProviderCount={state.routedProviderIds.length}
              settlementExecution={state.settlementExecution}
              settlementWarnings={state.settlementWarnings}
              successfulProviderCount={state.successfulProviderCount}
              variant="receipt"
              veniceProviderCount={state.veniceProviderCount}
              verifiedErc8004ProviderCount={state.verifiedErc8004ProviderCount}
            />
          </div>
        </details>
      </div>
    </section>
  );
}
