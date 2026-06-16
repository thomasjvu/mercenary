import { Icon } from '@iconify/react';
import { useEffect, useState } from 'react';
import { AppHeaderWallet } from './AppHeaderWallet.js';
import { BossRaidMark } from './BossRaidMark.js';

import { useAttestationInspector } from '../contexts/AttestationInspectorContext.js';
import {
  isExternalSidebarNavItem,
  isMarketplaceSectionActive,
  isSidebarNavActive,
  SIDEBAR_NAV_LINKS,
  type AppRoute,
  type SidebarInternalNavItem,
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
            <BossRaidMark compact />
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

      <div className="app-sidebar__bottom">
        <button
          aria-pressed={isOpen}
          className={`app-sidebar__tee-pill${isOpen ? ' app-sidebar__tee-pill--active' : ''}`}
          onClick={() => openInspector()}
          type="button"
        >
          <Icon
            className="icon icon--pixel app-sidebar__tee-pill-icon"
            icon="pixel:cybersecurity"
          />
          <span>TEE Attestation</span>
        </button>

        <div className="app-sidebar__wallet-expanded">
          <AppHeaderWallet onNavigate={onNavigate} />
        </div>

        <div aria-label="Account shortcuts" className="app-sidebar__wallet-collapsed">
          <button
            aria-label="TEE attestation"
            aria-pressed={isOpen}
            className={`app-sidebar__compact-icon app-sidebar__compact-icon--tee${isOpen ? ' app-sidebar__compact-icon--active' : ''}`}
            onClick={() => openInspector()}
            type="button"
          >
            <Icon
              className="icon icon--pixel app-sidebar__compact-icon-glyph"
              icon="pixel:cybersecurity"
            />
          </button>
          <AppHeaderWallet compact onNavigate={onNavigate} />
        </div>

        <div className="app-sidebar__utility">
          <button
            aria-label={appTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="app-sidebar__utility-icon app-sidebar__utility-icon--social"
            onClick={onThemeToggle}
            type="button"
          >
            <Icon
              className="icon icon--pixel"
              icon={appTheme === 'light' ? 'pixel:lightbulb-solid' : 'pixel:lightbulb'}
            />
          </button>
          <a
            aria-label="GitHub"
            className="app-sidebar__utility-icon app-sidebar__utility-icon--social"
            href="https://github.com/thomasjvu/mercenary"
            rel="noreferrer"
            target="_blank"
          >
            <Icon className="icon icon--pixel" icon="pixel:github" />
          </a>
          <a
            aria-label="YouTube"
            className="app-sidebar__utility-icon app-sidebar__utility-icon--social"
            href="https://www.youtube.com/@ultima_gg"
            rel="noreferrer"
            target="_blank"
          >
            <Icon className="icon icon--pixel" icon="pixel:youtube" />
          </a>
          <a
            aria-label="X"
            className="app-sidebar__utility-icon app-sidebar__utility-icon--social"
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

function SidebarNavEntry({
  item,
  active,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: SidebarInternalNavItem;
  active: boolean;
  pathname: string;
  collapsed: boolean;
  onNavigate: (path: AppRoute) => void;
}) {
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

function SidebarLink({
  path,
  label,
  icon,
  active,
  onNavigate,
  sub = false,
}: SidebarInternalNavItem & {
  active: boolean;
  onNavigate: (path: AppRoute) => void;
  sub?: boolean;
}) {
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

function SidebarExternalLink({
  href,
  label,
  icon,
}: Pick<SidebarInternalNavItem, 'label' | 'icon'> & { href: string }) {
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
