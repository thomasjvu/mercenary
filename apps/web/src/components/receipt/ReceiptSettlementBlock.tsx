import { buildSettlementLifecycleLabel, formatUsd, shortValue } from '@bossraid/proof-ui';
import type { RaidResult } from '../../api';
import { ReceiptDetailRow, ReceiptStat } from './ReceiptPrimitives';

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
  const childJobCount = settlementExecution?.childJobs.length ?? 0;

  return (
    <article className="receipt-surface">
      <div className="receipt-surface__head">
        <div>
          <p className="eyebrow">settlement</p>
          <h2>Settlement</h2>
        </div>
      </div>
      <div className="receipt-stat-grid">
        <ReceiptStat label="proof" value={settlementExecution?.proofStandard ?? 'pending'} />
        <ReceiptStat
          label="lifecycle"
          value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)}
        />
        <ReceiptStat label="successful" value={String(successfulProviderCount)} />
        <ReceiptStat
          label="payout each"
          value={
            payoutPerSuccessfulProvider == null ? 'pending' : formatUsd(payoutPerSuccessfulProvider)
          }
        />
      </div>
      <div className="receipt-proof-note receipt-proof-note--inline">
        <strong>Payout rule:</strong> Successful raiders split payout equally.
      </div>
      <div className="receipt-detail-list">
        <ReceiptDetailRow label="mode" value={settlementExecution?.mode ?? 'pending'} />
        <ReceiptDetailRow label="child jobs" value={String(childJobCount)} />
        <ReceiptDetailRow
          label="8004 verified"
          value={`${verifiedErc8004ProviderCount}/${erc8004ProviderCount || routedProviderCount || 0}`}
        />
        <ReceiptDetailRow label="venice routed" value={String(veniceProviderCount)} />
      </div>
      <details className="receipt-disclosure">
        <summary>show settlement fields</summary>
        <div className="receipt-detail-list">
          <ReceiptDetailRow
            label="registry ref"
            value={shortValue(settlementExecution?.registryRaidRef ?? 'pending')}
          />
          <ReceiptDetailRow
            label="evaluation hash"
            value={shortValue(settlementExecution?.evaluationHash ?? 'pending')}
          />
          {settlementWarnings[0] ? (
            <ReceiptDetailRow label="warning" value={settlementWarnings[0]} />
          ) : null}
        </div>
      </details>
    </article>
  );
}
