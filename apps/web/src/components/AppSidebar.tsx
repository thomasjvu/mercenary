import { Icon } from '@iconify/react';
import { BOSSRAID_DOCS_URL } from '@bossraid/ui';
import { AppHeaderWallet } from './AppHeaderWallet.js';
import { BossRaidMark } from './BossRaidMark.js';
import { useAttestationInspector } from '../contexts/AttestationInspectorContext.js';
import {
  isSidebarNavActive,
  SIDEBAR_ACCOUNT_LINKS,
  SIDEBAR_EXPLORE_LINKS,
  type AppRoute,
  type SidebarNavItem,
} from '../lib/app-routes.js';

type AppTheme = 'light' | 'dark';

type AppSidebarProps = {
  pathname: string;
  onNavigate: (path: AppRoute) => void;
  appTheme: AppTheme;
  onThemeToggle: () => void;
};

export function AppSidebar({ pathname, onNavigate, appTheme, onThemeToggle }: AppSidebarProps) {
  const { isOpen, openInspector } = useAttestationInspector();

  return (
    <aside aria-label="Site navigation" className="app-sidebar">
      <div className="app-sidebar__top">
        <button className="app-sidebar__brand" onClick={() => onNavigate('/')} type="button">
          <BossRaidMark compact />
          <span className="app-sidebar__title">Boss Raid</span>
        </button>

        <nav aria-label="Explore" className="app-sidebar__section">
          <p className="app-sidebar__section-label">explore</p>
          <div className="app-sidebar__links">
            {SIDEBAR_EXPLORE_LINKS.map((link) => (
              <SidebarLink
                active={isSidebarNavActive(link.path, pathname)}
                icon={link.icon}
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
                icon={link.icon}
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
        <button
          aria-pressed={isOpen}
          className={`app-sidebar__tee-pill${isOpen ? ' app-sidebar__tee-pill--active' : ''}`}
          onClick={() => openInspector()}
          type="button"
        >
          tee attestation
        </button>
        <AppHeaderWallet onNavigate={onNavigate} />
        <div className="app-sidebar__utility">
          <button
            aria-label="TEE attestation"
            aria-pressed={isOpen}
            className="app-sidebar__utility-icon app-sidebar__utility-icon--tee"
            onClick={() => openInspector()}
            type="button"
          >
            <Icon className="icon icon--pixel" icon="pixel:shield-solid" />
          </button>
          <button
            aria-label={appTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="app-sidebar__utility-icon app-sidebar__utility-icon--theme"
            onClick={onThemeToggle}
            type="button"
          >
            <Icon
              className="icon icon--pixel"
              icon={appTheme === 'dark' ? 'pixel:sun-solid' : 'pixel:moon-solid'}
            />
          </button>
          <button className="app-sidebar__utility-button" onClick={onThemeToggle} type="button">
            {appTheme === 'dark' ? 'light mode' : 'dark mode'}
          </button>
          <a
            aria-label="Documentation"
            className="app-sidebar__utility-icon app-sidebar__utility-icon--docs"
            href={BOSSRAID_DOCS_URL}
            rel="noreferrer"
            target="_blank"
          >
            <Icon className="icon icon--pixel" icon="pixel:scroll-solid" />
          </a>
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
  icon,
  active,
  onNavigate,
}: SidebarNavItem & {
  active: boolean;
  onNavigate: (path: AppRoute) => void;
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={`app-sidebar__link${active ? ' app-sidebar__link--active' : ''}`}
      onClick={() => onNavigate(path)}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" className="app-sidebar__link-icon icon icon--pixel" icon={icon} />
      <span className="app-sidebar__link-label">{label}</span>
    </button>
  );
}
