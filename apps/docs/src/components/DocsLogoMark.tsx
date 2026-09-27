import type { ReactElement } from 'react';

import mercenaryPfp from '@assets/boss-raid-pfp-256.png';

type DocsLogoMarkProps = {
  size?: 'sm' | 'lg';
};

export default function DocsLogoMark({ size = 'sm' }: DocsLogoMarkProps): ReactElement {
  return (
    <img
      alt="Mercenary"
      className={`logo-image shrink-0 ${size === 'lg' ? 'logo-image--lg' : ''}`}
      src={mercenaryPfp}
    />
  );
}
