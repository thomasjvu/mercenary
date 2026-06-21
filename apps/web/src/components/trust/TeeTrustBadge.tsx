import { teeTrustLabel, type TeeTrustLevel } from '../../lib/tee-trust-badge.js';

type TeeTrustBadgeProps = {
  level: TeeTrustLevel;
  className?: string;
  count?: number;
};

export function TeeTrustBadge({ level, className, count }: TeeTrustBadgeProps) {
  if (level === 'none') {
    return null;
  }

  const label = teeTrustLabel(level, count);
  const readyClass = level === 'verified' ? ' trust-badge--ready' : '';
  const extraClass = className ? ` ${className}` : '';

  return <span className={`trust-badge trust-badge--tee${readyClass}${extraClass}`}>{label}</span>;
}
