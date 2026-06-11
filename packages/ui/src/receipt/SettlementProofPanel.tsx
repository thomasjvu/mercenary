import {
  buildChildJobSummary,
  buildRoutingDecisionSummary,
  buildSettlementLifecycleLabel,
  countProvidersMatchingSignal,
  formatTimestamp,
  formatUsd,
  shortValue,
} from '@bossraid/proof-ui';
import type { RoutingDecisionLike } from '@bossraid/proof-ui';
import { ReceiptDetailRow, ReceiptStat } from './ReceiptPrimitives.js';

type SettlementRoutingProofLike = {
  policy: {
    privacyMode?: string;
    selectionMode?: string;
    requireErc8004?: boolean;
    minTrustScore?: number;
    venicePrivateLane?: boolean;
  };
  providers?: RoutingDecisionLike[];
};

type SettlementExecutionLike = {
  mode?: string;
  proofStandard?: string;
  lifecycleStatus?: 'pending' | 'partial' | 'terminal' | 'synthetic';
  artifactPath?: string;
  registryRaidRef?: string;
  taskHash?: string;
  evaluationHash?: string;
  finalizeTxHash?: string;
  contracts?: {
    registryAddress?: string | null;
    escrowAddress?: string | null;
  };
  allocations?: Array<{
    providerId: string;
    role: string;
    status: string;
    totalAmount: number;
  }>;
  transactionHashes?: string[];
  warnings?: string[];
  childJobs?: Array<{
    providerId: string;
    jobRef: string;
    role: string;
    status: string;
    lifecycleStatus: string;
    requestedAction: string;
    jobId?: string;
    syntheticJobId?: string;
    nextAction?: string | null;
    completeTxHash?: string;
    rejectTxHash?: string;
    submitTxHash?: string;
    fundTxHash?: string;
    budgetTxHash?: string;
    linkTxHash?: string;
    createTxHash?: string;
  }>;
};

type SettlementReputationEventLike = {
  providerId: string;
  type: string;
  timestamp: string;
};

type SettlementProofPanelProps = {
  variant: 'receipt' | 'ops';
  activeRaidId: string;
  resultStatus: string;
  approvedProviderCount: number;
  routingProof?: SettlementRoutingProofLike;
  settlementExecution?: SettlementExecutionLike;
  reputationEvents?: SettlementReputationEventLike[];
  successfulProviderCount?: number;
  payoutPerSuccessfulProvider?: number;
  routedProviderCount?: number;
  erc8004ProviderCount?: number;
  verifiedErc8004ProviderCount?: number;
  veniceProviderCount?: number;
  settlementWarnings?: string[];
};

function SettlementLabelValue({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'receipt' | 'ops';
}) {
  if (variant === 'receipt') {
    return <ReceiptStat label={label} value={value} />;
  }

  return (
    <div className="receipt-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SettlementProofPanel({
  variant,
  activeRaidId,
  resultStatus,
  approvedProviderCount,
  routingProof,
  settlementExecution,
  reputationEvents = [],
  successfulProviderCount,
  payoutPerSuccessfulProvider,
  routedProviderCount,
  erc8004ProviderCount: erc8004ProviderCountOverride,
  verifiedErc8004ProviderCount: verifiedErc8004ProviderCountOverride,
  veniceProviderCount: veniceProviderCountOverride,
  settlementWarnings = [],
}: SettlementProofPanelProps) {
  const routingDecisions = routingProof?.providers ?? [];
  const erc8004ProviderCount =
    erc8004ProviderCountOverride ??
    countProvidersMatchingSignal(
      routingDecisions,
      (decision) => decision.erc8004Registered === true
    );
  const verifiedErc8004ProviderCount =
    verifiedErc8004ProviderCountOverride ??
    countProvidersMatchingSignal(
      routingDecisions,
      (decision) => decision.erc8004VerificationStatus === 'verified'
    );
  const veniceProviderCount =
    veniceProviderCountOverride ??
    countProvidersMatchingSignal(routingDecisions, (decision) => decision.veniceBacked === true);
  const trustScoredProviderCount = countProvidersMatchingSignal(
    routingDecisions,
    (decision) => (decision.trustScore ?? 0) > 0
  );
  const childJobCount = settlementExecution?.childJobs?.length ?? 0;

  if (variant === 'receipt') {
    return (
      <>
        <div className="receipt-stat-grid">
          <ReceiptStat label="proof" value={settlementExecution?.proofStandard ?? 'pending'} />
          <ReceiptStat
            label="lifecycle"
            value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)}
          />
          <ReceiptStat label="successful" value={String(successfulProviderCount ?? 0)} />
          <ReceiptStat
            label="payout each"
            value={
              payoutPerSuccessfulProvider == null
                ? 'pending'
                : formatUsd(payoutPerSuccessfulProvider)
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
      </>
    );
  }

  return (
    <>
      <div className="receipt-grid">
        <SettlementLabelValue label="raid" value={activeRaidId} variant={variant} />
        <SettlementLabelValue label="status" value={resultStatus} variant={variant} />
        <SettlementLabelValue
          label="approved"
          value={String(approvedProviderCount)}
          variant={variant}
        />
        <SettlementLabelValue
          label="privacy mode"
          value={routingProof?.policy.privacyMode ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="selection"
          value={routingProof?.policy.selectionMode ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="venice lane"
          value={routingProof?.policy.venicePrivateLane ? 'active' : 'off'}
          variant={variant}
        />
        <SettlementLabelValue
          label="8004 required"
          value={routingProof?.policy.requireErc8004 ? 'yes' : 'no'}
          variant={variant}
        />
        <SettlementLabelValue
          label="min trust"
          value={
            routingProof?.policy.minTrustScore == null
              ? 'none'
              : String(routingProof.policy.minTrustScore)
          }
          variant={variant}
        />
        <SettlementLabelValue
          label="venice routed"
          value={String(veniceProviderCount)}
          variant={variant}
        />
        <SettlementLabelValue
          label="8004 routed"
          value={String(erc8004ProviderCount)}
          variant={variant}
        />
        <SettlementLabelValue
          label="8004 verified"
          value={String(verifiedErc8004ProviderCount)}
          variant={variant}
        />
        <SettlementLabelValue
          label="trust scored"
          value={String(trustScoredProviderCount)}
          variant={variant}
        />
        <SettlementLabelValue
          label="mode"
          value={settlementExecution?.mode ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="proof"
          value={settlementExecution?.proofStandard ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="lifecycle"
          value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)}
          variant={variant}
        />
        <SettlementLabelValue
          label="artifact"
          value={settlementExecution?.artifactPath ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="registry"
          value={settlementExecution?.registryRaidRef ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="registry contract"
          value={settlementExecution?.contracts?.registryAddress ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="escrow contract"
          value={settlementExecution?.contracts?.escrowAddress ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="task hash"
          value={settlementExecution?.taskHash ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="evaluation hash"
          value={settlementExecution?.evaluationHash ?? 'pending'}
          variant={variant}
        />
        <SettlementLabelValue
          label="finalize tx"
          value={shortValue(settlementExecution?.finalizeTxHash ?? 'pending')}
          variant={variant}
        />
        <SettlementLabelValue
          label="warnings"
          value={String(settlementExecution?.warnings?.length ?? 0)}
          variant={variant}
        />
      </div>

      <div className="receipt-list">
        <div className="receipt-list__section">
          <strong>routing proof</strong>
          {routingDecisions.length ? (
            routingDecisions.map((decision) => (
              <div
                className="receipt-row"
                key={`${decision.providerId}-${decision.workstreamId ?? 'root'}-${decision.phase}`}
              >
                <span>{decision.providerId}</span>
                <span>{buildRoutingDecisionSummary(decision)}</span>
              </div>
            ))
          ) : (
            <p className="quiet-note">No routing proof recorded yet.</p>
          )}
        </div>

        <div className="receipt-list__section">
          <strong>allocations</strong>
          {settlementExecution?.allocations?.length ? (
            settlementExecution.allocations.map((allocation) => (
              <div className="receipt-row" key={`${allocation.providerId}-${allocation.role}`}>
                <span>{allocation.providerId}</span>
                <span>
                  {allocation.role} · {allocation.status} · {formatUsd(allocation.totalAmount)}
                </span>
              </div>
            ))
          ) : (
            <p className="quiet-note">No settlement allocation yet.</p>
          )}
        </div>

        <div className="receipt-list__section">
          <strong>transactions</strong>
          {settlementExecution?.transactionHashes?.length ? (
            settlementExecution.transactionHashes.map((hash) => (
              <div className="receipt-row" key={hash}>
                <span>tx</span>
                <span>{hash}</span>
              </div>
            ))
          ) : (
            <p className="quiet-note">No onchain transaction yet.</p>
          )}
        </div>

        <div className="receipt-list__section">
          <strong>warnings</strong>
          {settlementExecution?.warnings?.length ? (
            settlementExecution.warnings.map((warning) => (
              <div className="receipt-row" key={warning}>
                <span>warn</span>
                <span>{warning}</span>
              </div>
            ))
          ) : (
            <p className="quiet-note">No settlement warnings recorded.</p>
          )}
        </div>

        <div className="receipt-list__section">
          <strong>child jobs</strong>
          {settlementExecution?.childJobs?.length ? (
            settlementExecution.childJobs.map((job) => (
              <div className="receipt-row" key={job.jobRef}>
                <span>{job.providerId}</span>
                <span>{buildChildJobSummary(job)}</span>
              </div>
            ))
          ) : (
            <p className="quiet-note">No child-job proof yet.</p>
          )}
        </div>

        <div className="receipt-list__section">
          <strong>reputation events</strong>
          {reputationEvents.length ? (
            reputationEvents.map((event) => (
              <div
                className="receipt-row"
                key={`${event.providerId}-${event.type}-${event.timestamp}`}
              >
                <span>{event.providerId}</span>
                <span>
                  {event.type} · {formatTimestamp(event.timestamp)}
                </span>
              </div>
            ))
          ) : (
            <p className="quiet-note">No reputation events recorded yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
