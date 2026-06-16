import type { DemoRequestMode } from '../../demo-result.js';
import { buildDemoModeLabel, buildDemoModeSummary } from '../../demo-result.js';

type MercenaryLaneBannerProps = {
  mode: DemoRequestMode;
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
        <strong>{buildDemoModeLabel(mode)}</strong>
      </div>
      <p className="mercenary-lane-banner__copy">{buildDemoModeSummary(mode)}</p>
    </div>
  );
}
