import { buildErc8004ProofLabel, hasErc8004Registration } from '@bossraid/proof-ui';
import heroImage from '../../../../../assets/hero.webp';
import {
  buildErc8004StatusValue,
  formatPrivacySignalLabel,
  formatUsdc,
  isVeniceProvider,
  pickDisplayPrivacySignals,
  readErc8004VerificationStatus,
  selectAvatarPosition,
  type RaiderRecord,
} from '../../lib/raiders';

type RaiderRowProps = {
  raider: RaiderRecord;
  rank: number;
};

export function RaiderRow({ raider, rank }: RaiderRowProps) {
  const registered = hasErc8004Registration(raider.provider);
  const verificationStatus = readErc8004VerificationStatus(raider.provider);
  const venice = isVeniceProvider(raider.provider);
  const avatarPosition = selectAvatarPosition(raider.provider.providerId, rank);
  const displaySignals = pickDisplayPrivacySignals(raider.privacySignals);
  const erc8004Tone =
    verificationStatus === 'verified' ||
    verificationStatus === 'partial' ||
    (verificationStatus == null && registered)
      ? 'proof'
      : 'muted';

  return (
    <article className="raider-row">
      <div className="raider-row__cover">
        <img
          alt={`${raider.provider.displayName} profile`}
          className="raider-row__cover-image"
          loading="lazy"
          src={heroImage}
          style={{ objectPosition: avatarPosition }}
        />
        <div className="raider-row__cover-scrim" />
        <div className="raider-row__cover-top">
          <span className="raider-row__rank">#{rank.toString().padStart(2, '0')}</span>
          <span className={`status-chip status-chip--${raider.activityTone}`}>
            {raider.activityLabel}
          </span>
        </div>
        <div className="raider-row__cover-copy">
          <strong>{raider.provider.displayName}</strong>
          <p className="raider-row__provider-id">{raider.provider.providerId}</p>
        </div>
      </div>

      <div className="raider-row__body">
        <div className="raider-row__meta-row">
          <strong className="raider-price">{formatUsdc(raider.provider.pricePerTaskUsd)}</strong>
          <div className="signal-strip">
            <SignalChip tone={erc8004Tone}>
              {buildErc8004ProofLabel(verificationStatus, registered, { style: 'long' })}
            </SignalChip>
            {raider.trustScore > 0 ? (
              <SignalChip tone="proof">{`trust ${raider.trustScore}`}</SignalChip>
            ) : null}
            {raider.provider.verification?.status === 'verified' ? (
              <SignalChip tone="proof">verified agent</SignalChip>
            ) : null}
            {venice ? <SignalChip tone="private">venice</SignalChip> : null}
            {displaySignals.map((signal) => (
              <SignalChip key={`${raider.provider.providerId}-${signal}`} tone="private">
                {formatPrivacySignalLabel(signal)}
              </SignalChip>
            ))}
          </div>
        </div>

        {raider.provider.description ? (
          <p className="raider-row__description">{raider.provider.description}</p>
        ) : null}

        <div className="raider-row__stats">
          <ListMetric label="rep" value={String(raider.reputationScore)} />
          <ListMetric label="tee" value={raider.privacySignals.includes('tee') ? 'yes' : 'no'} />
          <ListMetric label="wins" value={String(raider.successfulRaids)} />
          <ListMetric label="trust" value={String(raider.trustScore)} />
        </div>

        {raider.specializations.length > 0 ? (
          <div className="raider-chip-group">
            {raider.specializations.slice(0, 3).map((specialization) => (
              <span className="raider-chip" key={specialization}>
                {specialization}
              </span>
            ))}
          </div>
        ) : null}

        <div className="raider-row__facts">
          <FactBadge label="model" value={raider.modelLabel} />
          <FactBadge label="framework" value={raider.provider.agentFramework ?? 'custom'} />
          <FactBadge label="agent" value={raider.provider.agentId ?? 'pending'} />
          <FactBadge label="8004" value={buildErc8004StatusValue(verificationStatus, registered)} />
          <FactBadge label="seen" value={raider.lastSeenLabel} />
        </div>
      </div>
    </article>
  );
}

function ListMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SignalChip({ children, tone }: { children: string; tone: 'proof' | 'private' | 'muted' }) {
  return <span className={`signal-chip signal-chip--${tone}`}>{children}</span>;
}

function FactBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="raider-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
