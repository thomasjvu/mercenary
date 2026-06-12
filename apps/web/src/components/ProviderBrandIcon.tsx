import { Icon } from '@iconify/react';
import { resolveProviderBrand } from '../lib/provider-brand.js';

type ProviderBrandIconProps = {
  modelProvider?: string | null;
  size?: number;
  className?: string;
};

export function ProviderBrandIcon({
  modelProvider,
  size = 18,
  className = '',
}: ProviderBrandIconProps) {
  const brand = resolveProviderBrand(modelProvider);

  return (
    <Icon
      aria-label={brand.label}
      className={`provider-brand-icon ${className}`.trim()}
      height={size}
      icon={brand.icon}
      role="img"
      width={size}
    />
  );
}
