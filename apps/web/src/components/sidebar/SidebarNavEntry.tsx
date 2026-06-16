import { useEffect, useState } from 'react';
import {
  isMarketplaceSectionActive,
  isSidebarNavActive,
  type AppRoute,
  type SidebarInternalNavItem,
} from '../../lib/app-routes.js';
import { SidebarLink } from './SidebarLink.js';

type SidebarNavEntryProps = {
  item: SidebarInternalNavItem;
  active: boolean;
  pathname: string;
  collapsed: boolean;
  onNavigate: (path: AppRoute) => void;
};

export function SidebarNavEntry({
  item,
  active,
  pathname,
  collapsed,
  onNavigate,
}: SidebarNavEntryProps) {
  const hasChildren = Boolean(item.children?.length);
  const sectionActive = item.path === '/marketplace' && isMarketplaceSectionActive(pathname);
  const [expanded, setExpanded] = useState(sectionActive);

  useEffect(() => {
    if (sectionActive) {
      setExpanded(true);
    }
  }, [sectionActive]);

  const showSubnav = hasChildren && !collapsed && expanded;

  if (!hasChildren) {
    return (
      <div className={`app-sidebar__entry${active ? ' app-sidebar__entry--active' : ''}`}>
        <SidebarLink
          active={active}
          icon={item.icon}
          label={item.label}
          onNavigate={onNavigate}
          path={item.path}
        />
      </div>
    );
  }

  return (
    <div
      className={`app-sidebar__entry app-sidebar__entry--group${active ? ' app-sidebar__entry--active' : ''}${expanded ? ' app-sidebar__entry--expanded' : ''}`}
    >
      <div className="app-sidebar__group-head">
        <SidebarLink
          active={active}
          icon={item.icon}
          label={item.label}
          onNavigate={onNavigate}
          path={item.path}
        />
        <button
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse marketplace menu' : 'Expand marketplace menu'}
          className="app-sidebar__group-toggle"
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          <span aria-hidden="true" className="app-sidebar__group-chevron" />
        </button>
      </div>
      {showSubnav ? (
        <div className="app-sidebar__subnav">
          {item.children?.map((child) => (
            <SidebarLink
              active={isSidebarNavActive(child.path, pathname)}
              icon={child.icon}
              key={child.path}
              label={child.label}
              onNavigate={onNavigate}
              path={child.path}
              sub
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
