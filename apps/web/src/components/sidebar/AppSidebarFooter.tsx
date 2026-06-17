import { Icon } from '@iconify/react';
import { AppHeaderWallet } from '../AppHeaderWallet.js';
import type { AppRoute } from '../../lib/app-routes.js';

type AppTheme = 'light' | 'dark';

type AppSidebarFooterProps = {
  appTheme: AppTheme;
  isInspectorOpen: boolean;
  onNavigate: (path: AppRoute) => void;
  onOpenInspector: () => void;
  onThemeToggle: () => void;
};

export function AppSidebarFooter({
  appTheme,
  isInspectorOpen,
  onNavigate,
  onOpenInspector,
  onThemeToggle,
}: AppSidebarFooterProps) {
  return (
    <div className="app-sidebar__bottom">
      <button
        aria-pressed={isInspectorOpen}
        className={`button button--pill button--block app-sidebar__tee-pill${isInspectorOpen ? ' button--pill--active' : ''}`}
        onClick={onOpenInspector}
        type="button"
      >
        <Icon className="icon icon--pixel app-sidebar__tee-pill-icon" icon="pixel:cybersecurity" />
        <span>TEE Attestation</span>
      </button>

      <div className="app-sidebar__wallet-expanded">
        <AppHeaderWallet onNavigate={onNavigate} />
      </div>

      <div aria-label="Account shortcuts" className="app-sidebar__wallet-collapsed">
        <button
          aria-label="TEE attestation"
          aria-pressed={isInspectorOpen}
          className={`app-sidebar__compact-icon app-sidebar__compact-icon--tee${isInspectorOpen ? ' app-sidebar__compact-icon--active' : ''}`}
          onClick={onOpenInspector}
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
          aria-label="X"
          className="app-sidebar__utility-icon app-sidebar__utility-icon--social"
          href="https://x.com/ultima_gg"
          rel="noreferrer"
          target="_blank"
        >
          <Icon className="icon icon--pixel" icon="pixel:x" />
        </a>
        <a
          aria-label="Threads"
          className="app-sidebar__utility-icon app-sidebar__utility-icon--social"
          href="https://www.threads.net/@ultima_gg"
          rel="noreferrer"
          target="_blank"
        >
          <Icon className="icon icon--pixel" icon="pixel:threads" />
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
      </div>
      <p className="app-sidebar__credit">
        © 2026 Boss Raid ·{' '}
        <a href="https://ultima.gg" rel="noreferrer" target="_blank">
          Ultima
        </a>
      </p>
    </div>
  );
}
