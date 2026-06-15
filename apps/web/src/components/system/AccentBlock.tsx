import type { ReactNode } from 'react';

type AccentTone = 'blue' | 'yellow' | 'red';

type AccentBlockProps = {
  children: ReactNode;
  className?: string;
  tone?: AccentTone;
};

export function AccentBlock({ children, className = '', tone = 'blue' }: AccentBlockProps) {
  return (
    <div className={`accent-block accent-block--${tone}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
