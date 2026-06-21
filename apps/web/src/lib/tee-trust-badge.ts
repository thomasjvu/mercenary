export type TeeTrustLevel = 'none' | 'claimed' | 'verified' | 'failed';

export function resolveTeeTrustLevel(input: {
  catalogTeeAttested?: boolean;
  liveVerifyValid?: boolean | null;
}): TeeTrustLevel {
  if (input.liveVerifyValid === true) {
    return 'verified';
  }
  if (input.liveVerifyValid === false) {
    return 'failed';
  }
  if (input.catalogTeeAttested) {
    return 'claimed';
  }
  return 'none';
}

export function teeTrustLabel(level: TeeTrustLevel, count?: number): string {
  if (level === 'none') {
    return '';
  }

  const base =
    level === 'verified' ? 'tee verified' : level === 'claimed' ? 'tee claimed' : 'tee failed';
  if (count != null && count > 0) {
    return `${count} ${base}`;
  }
  return base;
}
