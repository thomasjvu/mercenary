import type { MercenaryRequestMode } from '../../mercenary-result.js';
import { buildRequestModeLabel, buildRequestModeSummary } from '../../mercenary-result.js';

type MercenaryLaneBannerProps = {
  mode: MercenaryRequestMode;
};

export function MercenaryLaneBanner({ mode }: MercenaryLaneBannerProps) {
  const isRaid = mode === 'raid';

  return (
    <div
      aria-live="polite"
      className={`mercenary-lane-banner mercenary-lane-banner--${isRaid ? 'raid' : 'inference'}`}
    >
      <div className="mercenary-lane-banner__label">
        <span className="mercenary-lane-banner__kicker">active lane</span>
        <strong>{buildRequestModeLabel(mode)}</strong>
      </div>
      <p className="mercenary-lane-banner__copy">{buildRequestModeSummary(mode)}</p>
    </div>
  );
}
