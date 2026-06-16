import { Icon } from '@iconify/react';
import type { SidebarInternalNavItem } from '../../lib/app-routes.js';

type SidebarExternalLinkProps = Pick<SidebarInternalNavItem, 'label' | 'icon'> & {
  href: string;
};

export function SidebarExternalLink({ href, label, icon }: SidebarExternalLinkProps) {
  return (
    <a
      aria-label={label}
      className="app-sidebar__link app-sidebar__link--external"
      href={href}
      rel="noreferrer"
      target="_blank"
      title={label}
    >
      <Icon aria-hidden="true" className="app-sidebar__link-icon icon icon--pixel" icon={icon} />
      <span className="app-sidebar__link-label">{label}</span>
      <Icon
        aria-hidden="true"
        className="app-sidebar__link-external-icon icon icon--pixel"
        icon="pixel:external-link-solid"
      />
    </a>
  );
}
