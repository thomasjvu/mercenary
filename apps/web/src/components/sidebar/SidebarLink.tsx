import { Icon } from '@iconify/react';
import type { AppRoute, SidebarInternalNavItem } from '../../lib/app-routes.js';

type SidebarLinkProps = SidebarInternalNavItem & {
  active: boolean;
  onNavigate: (path: AppRoute) => void;
  sub?: boolean;
};

export function SidebarLink({
  path,
  label,
  icon,
  active,
  onNavigate,
  sub = false,
}: SidebarLinkProps) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={`app-sidebar__link${sub ? ' app-sidebar__link--sub' : ''}${active ? ' app-sidebar__link--active' : ''}`}
      onClick={() => onNavigate(path)}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" className="app-sidebar__link-icon icon icon--pixel" icon={icon} />
      <span className="app-sidebar__link-label">{label}</span>
    </button>
  );
}
