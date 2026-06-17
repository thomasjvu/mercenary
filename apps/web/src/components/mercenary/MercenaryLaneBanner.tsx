export function MercenaryLaneBanner() {
  return (
    <div aria-live="polite" className="mercenary-lane-banner mercenary-lane-banner--raid">
      <div className="mercenary-lane-banner__label">
        <span className="mercenary-lane-banner__kicker">active lane</span>
        <strong>Mercenary</strong>
      </div>
      <p className="mercenary-lane-banner__copy">
        One chat surface. Mercenary answers directly or opens specialists when the request needs
        scoped work.
      </p>
    </div>
  );
}
