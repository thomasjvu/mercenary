import type { ReactNode } from 'react';
import type { AppRoute } from '../../lib/app-routes.js';

type LegalLinkProps = {
  href: AppRoute;
  onNavigate: (path: AppRoute) => void;
  children: ReactNode;
  className?: string;
};

export function LegalLink({
  href,
  onNavigate,
  children,
  className = 'legal-document__link',
}: LegalLinkProps) {
  return (
    <a
      className={className}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(href);
      }}
    >
      {children}
    </a>
  );
}
