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
    <section className="receipt-dashboard receipt-dashboard--scroll">
      <ReceiptOutputSection
        approvedSubmissionCount={state.approvedSubmissionCount}
        currentReceiptStatus={state.currentReceiptStatus}
        result={state.result.data}
      />

      <ReceiptAttestationSection
        activeQuery={activeQuery}
        attestedResult={state.attestedResult.data}
        attestedRuntime={state.attestedRuntime.data}
        attestationSurfaceLabel={state.attestationSurfaceLabel}
        attestationTarget={state.attestationTarget}
        attestationTee={state.attestationTee}
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

      <ReceiptProviderList rows={state.providerRows} />

      <article className="receipt-surface">
        <div className="receipt-surface__head">
          <div>
            <p className="eyebrow">settlement</p>
            <h2>Settlement</h2>
          </div>
        </div>
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
      </article>
    </section>
  );
}
