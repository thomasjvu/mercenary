import { Icon } from '@iconify/react';
import { AppSidebarFooter } from './sidebar/AppSidebarFooter.js';
import { SidebarExternalLink } from './sidebar/SidebarExternalLink.js';
import { SidebarNavEntry } from './sidebar/SidebarNavEntry.js';
import { useAttestationInspector } from '../contexts/AttestationInspectorContext.js';
import {
  isExternalSidebarNavItem,
  isSidebarNavActive,
  SIDEBAR_NAV_LINKS,
  type AppRoute,
} from '../lib/app-routes.js';

type AppTheme = 'light' | 'dark';

type AppSidebarProps = {
  pathname: string;
  onNavigate: (path: AppRoute) => void;
  appTheme: AppTheme;
  collapsed: boolean;
  onSidebarToggle: () => void;
  onThemeToggle: () => void;
};

export function AppSidebar({
  pathname,
  onNavigate,
  appTheme,
  collapsed,
  onSidebarToggle,
  onThemeToggle,
}: AppSidebarProps) {
  const { isOpen, openInspector } = useAttestationInspector();

  return (
    <aside
      aria-label="Site navigation"
      className={`app-sidebar${collapsed ? ' app-sidebar--collapsed' : ''}`}
    >
      <div className="app-sidebar__top">
        <div className="app-sidebar__brand-row">
          <button className="app-sidebar__brand" onClick={() => onNavigate('/')} type="button">
            <span className="app-sidebar__title">Boss Raid</span>
          </button>
          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            className="app-sidebar__toggle"
            onClick={onSidebarToggle}
            type="button"
          >
            <Icon className="icon icon--pixel app-sidebar__toggle-icon" icon="pixel:bars-solid" />
          </button>
        </div>

        <nav aria-label="Primary" className="app-sidebar__section">
          <div className="app-sidebar__links">
            {SIDEBAR_NAV_LINKS.map((link) =>
              isExternalSidebarNavItem(link) ? (
                <div className="app-sidebar__entry" key={link.href}>
                  <SidebarExternalLink href={link.href} icon={link.icon} label={link.label} />
                </div>
              ) : (
                <SidebarNavEntry
                  active={isSidebarNavActive(link.path, pathname)}
                  collapsed={collapsed}
                  item={link}
                  key={link.path}
                  onNavigate={onNavigate}
                  pathname={pathname}
                />
              )
            )}
          </div>
        </nav>
      </div>

      <AppSidebarFooter
        appTheme={appTheme}
        isInspectorOpen={isOpen}
        onNavigate={onNavigate}
        onOpenInspector={() => openInspector()}
        onThemeToggle={onThemeToggle}
      />
    </aside>
  );
}
