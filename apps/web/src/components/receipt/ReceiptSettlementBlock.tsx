import { SettlementProofPanel } from '@bossraid/ui';
import type { RaidResult } from '../../api';

type SettlementExecution = NonNullable<RaidResult['settlementExecution']>;

type ReceiptSettlementBlockProps = {
  settlementExecution: SettlementExecution | undefined;
  successfulProviderCount: number;
  payoutPerSuccessfulProvider: number | undefined;
  verifiedErc8004ProviderCount: number;
  erc8004ProviderCount: number;
  routedProviderCount: number;
  veniceProviderCount: number;
  settlementWarnings: string[];
};

export function ReceiptSettlementBlock({
  settlementExecution,
  successfulProviderCount,
  payoutPerSuccessfulProvider,
  verifiedErc8004ProviderCount,
  erc8004ProviderCount,
  routedProviderCount,
  veniceProviderCount,
  settlementWarnings,
}: ReceiptSettlementBlockProps) {
  return (
    <article className="receipt-surface">
      <div className="receipt-surface__head">
        <div>
          <p className="eyebrow">settlement</p>
          <h2>Settlement</h2>
        </div>
      </div>
      <SettlementProofPanel
        activeRaidId="receipt"
        approvedProviderCount={successfulProviderCount}
        erc8004ProviderCount={erc8004ProviderCount}
        payoutPerSuccessfulProvider={payoutPerSuccessfulProvider}
        resultStatus={settlementExecution?.lifecycleStatus ?? 'pending'}
        routedProviderCount={routedProviderCount}
        settlementExecution={settlementExecution}
        settlementWarnings={settlementWarnings}
        successfulProviderCount={successfulProviderCount}
        variant="receipt"
        veniceProviderCount={veniceProviderCount}
        verifiedErc8004ProviderCount={verifiedErc8004ProviderCount}
      />
    </article>
  );
}
