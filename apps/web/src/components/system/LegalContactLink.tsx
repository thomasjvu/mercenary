import { PHANTASY_LEGAL } from '../../lib/legal/constants.js';

export function LegalContactLink() {
  return (
    <a href={PHANTASY_LEGAL.contactUrl} rel="noreferrer" target="_blank">
      {PHANTASY_LEGAL.contactLabel}
    </a>
  );
}
