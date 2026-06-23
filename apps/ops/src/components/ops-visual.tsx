import type { CSSProperties, ReactNode } from 'react';

export type OpsIconName =
  | 'live'
  | 'launch'
  | 'platform'
  | 'providers'
  | 'mesh'
  | 'payment'
  | 'shield'
  | 'chart'
  | 'link'
  | 'lock'
  | 'raid'
  | 'output'
  | 'proof'
  | 'rank'
  | 'check'
  | 'warn'
  | 'error'
  | 'external';

const ICON_PATHS: Record<OpsIconName, ReactNode> = {
  live: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1" />
    </>
  ),
  launch: (
    <>
      <path d="M12 3l7 14H5L12 3z" />
      <path d="M12 10v4" />
    </>
  ),
  platform: (
    <>
      <rect height="7" rx="0" width="7" x="3" y="3" />
      <rect height="7" rx="0" width="7" x="14" y="3" />
      <rect height="7" rx="0" width="7" x="3" y="14" />
      <rect height="7" rx="0" width="7" x="14" y="14" />
    </>
  ),
  providers: (
    <>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M4 19c0-2.2 1.8-4 4-4s4 1.8 4 4M12 19c0-2.2 1.8-4 4-4s4 1.8 4 4" />
    </>
  ),
  mesh: (
    <>
      <path d="M12 2l8 5v10l-8 5-8-5V7l8-5z" />
      <path d="M12 12l8-5M12 12L4 7M12 12v10" />
    </>
  ),
  payment: (
    <>
      <rect height="14" rx="0" width="18" x="3" y="5" />
      <path d="M3 10h18" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 18V8M10 18V4M16 18v-6M22 18v-10" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 1 0-5.7l1.3-1.3a4 4 0 0 1 5.7 5.7l-1 1" />
      <path d="M14 10a4 4 0 0 1 0 5.7l-1.3 1.3a4 4 0 0 1-5.7-5.7l1-1" />
    </>
  ),
  lock: (
    <>
      <rect height="8" rx="0" width="12" x="6" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  raid: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  output: (
    <>
      <path d="M6 6h12v12H6z" />
      <path d="M9 10h6M9 14h4" />
    </>
  ),
  proof: (
    <>
      <path d="M8 4h8l4 4v12H4V4h4z" />
      <path d="M12 4v4h4M9 14l2 2 4-4" />
    </>
  ),
  rank: (
    <>
      <path d="M6 18h12M8 14l4-8 4 8" />
    </>
  ),
  check: <path d="M6 12l4 4 8-8" />,
  warn: (
    <>
      <path d="M12 4l8 14H4L12 4z" />
      <path d="M12 10v4M12 18h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M10 14L20 4M16 10h4v10H4V10h4" />
    </>
  ),
};

export function OpsIcon({
  name,
  className,
  size = 20,
}: {
  name: OpsIconName;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `ops-icon ${className}` : 'ops-icon'}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width={size}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

type SegmentBarTone = 'ref' | 'market' | 'savings' | 'volume' | 'good' | 'danger';

export function SegmentBar({
  value,
  segments = 24,
  tone = 'market',
  className,
}: {
  value: number;
  segments?: number;
  tone?: SegmentBarTone;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const litCount = Math.max(0, Math.min(segments, Math.round((clamped / 100) * segments)));

  return (
    <div
      aria-hidden="true"
      className={`rx-segment-bar rx-segment-bar--${tone}${className ? ` ${className}` : ''}`}
      style={{ ['--segment-count' as string]: String(segments) }}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          className={`rx-segment-bar__block${index < litCount ? ' rx-segment-bar__block--lit' : ''}`}
          key={index}
        />
      ))}
    </div>
  );
}

export function OpsKpiTile({
  icon,
  label,
  value,
  hint,
  tone = 'default',
  meter,
}: {
  icon?: OpsIconName;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'danger' | 'accent';
  meter?: number;
}) {
  return (
    <article className={`ops-kpi ops-kpi--${tone}`}>
      <div className="ops-kpi__head">
        {icon ? <OpsIcon className="ops-kpi__icon" name={icon} size={18} /> : null}
        <span className="ops-kpi__label">{label}</span>
      </div>
      <strong className="ops-kpi__value">{value}</strong>
      {meter != null ? <SegmentBar className="ops-kpi__meter" tone="market" value={meter} /> : null}
      {hint ? <span className="ops-kpi__hint">{hint}</span> : null}
    </article>
  );
}

export function OpsFold({
  title,
  count,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: string;
  icon?: OpsIconName;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="ops-fold" open={defaultOpen}>
      <summary className="ops-fold__summary">
        <span className="ops-fold__title">
          {icon ? <OpsIcon name={icon} size={16} /> : null}
          <span>{title}</span>
        </span>
        {count ? <span className="ops-fold__count">{count}</span> : null}
      </summary>
      <div className="ops-fold__body">{children}</div>
    </details>
  );
}

export function ReadinessMeter({ pass, warn, fail }: { pass: number; warn: number; fail: number }) {
  const total = Math.max(pass + warn + fail, 1);
  const passPct = (pass / total) * 100;
  const warnPct = (warn / total) * 100;
  const failPct = (fail / total) * 100;

  return (
    <div aria-label="Readiness check distribution" className="ops-readiness-meter">
      <div className="ops-readiness-meter__bar">
        <span
          className="ops-readiness-meter__seg ops-readiness-meter__seg--pass"
          style={{ width: `${passPct}%` }}
        />
        <span
          className="ops-readiness-meter__seg ops-readiness-meter__seg--warn"
          style={{ width: `${warnPct}%` }}
        />
        <span
          className="ops-readiness-meter__seg ops-readiness-meter__seg--fail"
          style={{ width: `${failPct}%` }}
        />
      </div>
      <div className="ops-readiness-meter__legend">
        <span>{pass} pass</span>
        <span>{warn} warn</span>
        <span>{fail} fail</span>
      </div>
    </div>
  );
}

export function RouteLatencyChart({
  routes,
}: {
  routes: Array<{ route: string; count: number; averageLatencyMs: number; errorCount: number }>;
}) {
  const maxCount = Math.max(...routes.map((route) => route.count), 1);

  return (
    <div className="ops-route-chart">
      {routes.map((entry) => {
        const volumePct = (entry.count / maxCount) * 100;
        const latencyTone =
          entry.averageLatencyMs > 500
            ? 'danger'
            : entry.averageLatencyMs > 200
              ? 'savings'
              : 'good';

        return (
          <div className="ops-route-chart__row" key={entry.route}>
            <div className="ops-route-chart__meta">
              <strong>{entry.route}</strong>
              <span>
                {entry.count} req · {Math.round(entry.averageLatencyMs)}ms
                {entry.errorCount > 0 ? ` · ${entry.errorCount} err` : ''}
              </span>
            </div>
            <SegmentBar
              className="ops-route-chart__bar"
              segments={20}
              tone={latencyTone}
              value={volumePct}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ProviderScoreBars({
  reputation,
  privacy,
  trust,
}: {
  reputation: number;
  privacy: number;
  trust: number;
}) {
  return (
    <div className="ops-score-bars">
      <div className="ops-score-bars__row">
        <span>rep</span>
        <SegmentBar segments={16} tone="market" value={reputation} />
      </div>
      <div className="ops-score-bars__row">
        <span>priv</span>
        <SegmentBar segments={16} tone="ref" value={privacy} />
      </div>
      <div className="ops-score-bars__row">
        <span>trust</span>
        <SegmentBar segments={16} tone="volume" value={trust} />
      </div>
    </div>
  );
}

export function OpsStatusOrb({
  state,
  label,
}: {
  state: 'ready' | 'warm' | 'down' | 'live' | 'idle' | 'blocked';
  label: string;
}) {
  return (
    <span className={`ops-status-orb ops-status-orb--${state}`}>
      <span aria-hidden="true" className="ops-status-orb__dot" />
      {label}
    </span>
  );
}

export function OpsSubNav({
  items,
  activeId,
  onSelect,
}: {
  items: Array<{ id: string; label: string; icon: OpsIconName }>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Section views" className="ops-sub-nav">
      {items.map((item) => (
        <button
          aria-current={activeId === item.id ? 'page' : undefined}
          className={`ops-sub-nav__item${activeId === item.id ? ' ops-sub-nav__item--active' : ''}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          <OpsIcon name={item.icon} size={16} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function OpsSectionHeader({
  icon,
  title,
  aside,
}: {
  icon: OpsIconName;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <header className="ops-section-header flat-section">
      <div className="ops-section-header__main">
        <OpsIcon name={icon} size={22} />
        <h1>{title}</h1>
      </div>
      {aside}
    </header>
  );
}

export function OpsConsumerDock({
  links,
}: {
  links: Array<{ label: string; href: string; primary?: boolean; icon: OpsIconName }>;
}) {
  return (
    <div aria-label="Consumer surfaces" className="ops-consumer-dock">
      {links.map((link) => (
        <a
          className={`ops-consumer-dock__link${link.primary ? ' ops-consumer-dock__link--primary' : ''}`}
          href={link.href}
          key={link.href}
          rel="noreferrer"
          target="_blank"
          title={link.label}
        >
          <OpsIcon name={link.icon} size={16} />
          <span>{link.label}</span>
        </a>
      ))}
    </div>
  );
}
