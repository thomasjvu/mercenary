import { Icon } from '@iconify/react';
import { formatUsdc, hasErc8004Registration } from '@bossraid/proof-ui';
import heroImage from '../../assets/hero.webp';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import {
  isVeniceProvider,
  pickDisplayPrivacySignals,
  readErc8004VerificationStatus,
  selectAvatarPosition,
  type RaiderRecord,
} from '../../lib/raiders';

type RaiderRowProps = {
  raider: RaiderRecord;
  rank: number;
  onTry?: () => void;
  onMarket?: () => void;
};

export function RaiderRow({ raider, rank, onTry, onMarket }: RaiderRowProps) {
  const registered = hasErc8004Registration(raider.provider);
  const verificationStatus = readErc8004VerificationStatus(raider.provider);
  const venice = isVeniceProvider(raider.provider);
  const avatarPosition = selectAvatarPosition(raider.provider.providerId, rank);
  const displaySignals = pickDisplayPrivacySignals(raider.privacySignals);
  const erc8004Verified =
    verificationStatus === 'verified' ||
    verificationStatus === 'partial' ||
    (verificationStatus == null && registered);

  return (
    <article className="raider-row raider-row--compact">
      <div className="raider-row__avatar-wrap">
        <img
          alt=""
          className="raider-row__avatar"
          loading="lazy"
          src={heroImage}
          style={{ objectPosition: avatarPosition }}
        />
        <span
          aria-hidden="true"
          className={`raider-row__presence raider-row__presence--${raider.activityTone}`}
        />
      </div>

      <div className="raider-row__content">
        <div className="raider-row__headline">
          <div className="raider-row__identity">
            <ProviderBrandIcon modelProvider={raider.provider.modelProvider} size={16} />
            <strong>{raider.provider.displayName}</strong>
          </div>
        </div>

        <p className="raider-row__meta-line">
          <span
            className={`raider-row__online raider-row__online--${raider.isOnline ? 'online' : 'offline'}`}
          >
            <span aria-hidden="true" className="raider-row__online-dot" />
            {raider.onlineLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span>{raider.modelLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="raider-row__price">{formatUsdc(raider.provider.pricePerTaskUsd)}</span>
        </p>

        <div aria-label="Raider signals" className="raider-row__signals" role="list">
          <RaiderBadge
            icon="pixel:star-solid"
            label="reputation"
            value={String(raider.reputationScore)}
          />
          <RaiderBadge
            icon="pixel:trophy-solid"
            label="wins"
            value={String(raider.successfulRaids)}
          />
          {raider.provider.agentFramework && raider.provider.agentFramework !== 'custom' ? (
            <RaiderBadge
              icon="pixel:robot-solid"
              label={String(raider.provider.agentFramework).replace(/_/g, ' ')}
            />
          ) : null}
          {raider.provider.harnessProfile?.installation === 'fresh' ||
          (!raider.provider.harnessProfile &&
            (raider.provider.source?.type === 'inference_hosted' ||
              raider.provider.source?.type === 'venice_hosted')) ? (
            <RaiderBadge icon="pixel:checkmark-solid" label="vanilla / fresh" />
          ) : null}
          {raider.provider.harnessProfile?.installation === 'skill_augmented' ? (
            <RaiderBadge
              icon="pixel:cog-solid"
              label={`${raider.provider.harnessProfile.skills.length || 0} skills`}
            />
          ) : null}
          {raider.provider.harnessProfile?.credentialClass === 'api_key' ? (
            <RaiderBadge icon="pixel:key-solid" label="API key" />
          ) : null}
          {raider.provider.harnessProfile?.credentialClass === 'plan_or_cli' ? (
            <RaiderBadge icon="pixel:user-solid" label="plan / CLI" />
          ) : null}
          {raider.provider.verification?.status === 'verified' ? (
            <RaiderBadge icon="pixel:check-solid" label="verified agent" />
          ) : null}
          {erc8004Verified ? <RaiderBadge icon="pixel:badge-check-solid" label="ERC-8004" /> : null}
          {displaySignals.includes('tee') ? (
            <RaiderBadge icon="pixel:cybersecurity" label="tee claimed" />
          ) : null}
          {venice ? <RaiderBadge icon="pixel:lock-solid" label="Venice private lane" /> : null}
          {displaySignals.includes('e2ee') ? (
            <RaiderBadge icon="pixel:lock-solid" label="E2EE" />
          ) : null}
        </div>
      </div>

      <div className="raider-row__actions">
        {onTry ? (
          <button className="button button--pill" onClick={onTry} type="button">
            try
          </button>
        ) : null}
        {onMarket ? (
          <button className="button button--pill" onClick={onMarket} type="button">
            market
          </button>
        ) : null}
      </div>
    </article>
  );
}

function RaiderBadge({ icon, label, value }: { icon: string; label: string; value?: string }) {
  const ariaLabel = value ? `${label}: ${value}` : label;

  return (
    <span aria-label={ariaLabel} className="raider-row__badge" role="listitem" title={ariaLabel}>
      <Icon aria-hidden="true" className="raider-row__badge-icon icon icon--pixel" icon={icon} />
      {value ? <span className="raider-row__badge-value">{value}</span> : null}
    </span>
  );
}
