import type { CSSProperties } from 'react';

export function cssCustomProperty(name: `--${string}`, value: string | number): CSSProperties {
  return { [name]: value } as CSSProperties;
}
