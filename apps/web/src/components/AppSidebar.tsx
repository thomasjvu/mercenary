import { Icon } from '@iconify/react';
import { BOSSRAID_DOCS_URL } from '@bossraid/ui';
import { AppHeaderWallet } from './AppHeaderWallet.js';
import { HostTeeTrustStrip } from './trust/HostTeeTrustStrip.js';
import {
  isSidebarNavActive,
  SIDEBAR_ACCOUNT_LINKS,
  SIDEBAR_EXPLORE_LINKS,
  type AppRoute,
} from '../lib/app-routes.js';

type AppTheme = 'light' | 'dark';

type AppSidebarProps = {
  pathname: string;
  onNavigate: (path: AppRoute) => void;
  appTheme: AppTheme;
  onThemeToggle: () => void;
};

export function AppSidebar({ pathname, onNavigate, appTheme, onThemeToggle }: AppSidebarProps) {
  return (
    <aside aria-label="Site navigation" className="app-sidebar">
      <div className="app-sidebar__top">
        <button className="app-sidebar__brand" onClick={() => onNavigate('/')} type="button">
          <span className="app-sidebar__mark">BR</span>
          <span className="app-sidebar__title">Boss Raid</span>
        </button>

        <nav aria-label="Explore" className="app-sidebar__section">
          <p className="app-sidebar__section-label">explore</p>
          <div className="app-sidebar__links">
            {SIDEBAR_EXPLORE_LINKS.map((link) => (
              <SidebarLink
                active={isSidebarNavActive(link.path, pathname)}
                key={link.path}
                label={link.label}
                onNavigate={onNavigate}
                path={link.path}
              />
            ))}
          </div>
        </nav>

        <nav aria-label="Account" className="app-sidebar__section">
          <p className="app-sidebar__section-label">account</p>
          <div className="app-sidebar__links">
            {SIDEBAR_ACCOUNT_LINKS.map((link) => (
              <SidebarLink
                active={isSidebarNavActive(link.path, pathname)}
                key={link.path}
                label={link.label}
                onNavigate={onNavigate}
                path={link.path}
              />
            ))}
          </div>
        </nav>
      </div>

      <div className="app-sidebar__bottom">
        <HostTeeTrustStrip variant="sidebar" />
        <AppHeaderWallet onNavigate={onNavigate} />
        <div className="app-sidebar__utility">
          <button className="app-sidebar__utility-button" onClick={onThemeToggle} type="button">
            {appTheme === 'dark' ? 'light mode' : 'dark mode'}
          </button>
          <a
            className="app-sidebar__utility-button"
            href={BOSSRAID_DOCS_URL}
            rel="noreferrer"
            target="_blank"
          >
            docs
          </a>
          <a
            aria-label="GitHub"
            className="app-sidebar__utility-icon"
            href="https://github.com/thomasjvu/mercenary"
            rel="noreferrer"
            target="_blank"
          >
            <Icon className="icon icon--pixel" icon="pixel:github" />
          </a>
          <a
            aria-label="X"
            className="app-sidebar__utility-icon"
            href="https://x.com/ultima_gg"
            rel="noreferrer"
            target="_blank"
          >
            <Icon className="icon icon--pixel" icon="pixel:x" />
          </a>
        </div>
        <p className="app-sidebar__credit">
          © 2026 Boss Raid ·{' '}
          <a href="https://ultima.gg" rel="noreferrer" target="_blank">
            Ultima
          </a>
        </p>
      </div>
    </aside>
  );
}

function SidebarLink({
  path,
  label,
  active,
  onNavigate,
}: {
  path: AppRoute;
  label: string;
  active: boolean;
  onNavigate: (path: AppRoute) => void;
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={`app-sidebar__link${active ? ' app-sidebar__link--active' : ''}`}
      onClick={() => onNavigate(path)}
      type="button"
    >
      {label}
    </button>
  );
}
