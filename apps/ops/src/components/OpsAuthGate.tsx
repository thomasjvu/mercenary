import { DocsButton } from '@bossraid/ui';
import { CONSUMER_LINKS } from '../lib/consumer-urls';
import { OpsIcon } from './ops-visual';

export function OpsAuthGate({
  adminTokenInput,
  authPending,
  authMessage,
  appTheme,
  onTokenChange,
  onSubmit,
  onThemeToggle,
}: {
  adminTokenInput: string;
  authPending: boolean;
  authMessage: string | null;
  appTheme: 'light' | 'dark';
  onTokenChange: (value: string) => void;
  onSubmit: () => void;
  onThemeToggle: () => void;
}) {
  return (
    <main className="ops-shell ops-shell--locked">
      <section className="ops-auth-card">
        <div className="ops-auth-card__band">
          <OpsIcon name="lock" size={28} />
          <p className="eyebrow">Boss Raid Ops</p>
        </div>

        <form
          className="ops-auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="ops-auth-card__copy">
            <h1>Unlock control plane</h1>
            <label className="ops-auth-field">
              <span className="eyebrow">admin token</span>
              <input
                autoComplete="current-password"
                className="search ops-auth-input"
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder="BOSSRAID_ADMIN_TOKEN"
                type="password"
                value={adminTokenInput}
              />
            </label>
            {authMessage ? <p className="error-note">{authMessage}</p> : null}
          </div>

          <div className="ops-auth-unlock-wrap">
            <button
              className="button button--primary ops-auth-unlock rx-spacebar-clip"
              disabled={authPending}
              type="submit"
            >
              {authPending ? 'unlocking' : 'unlock ops'}
            </button>
          </div>

          <div className="ops-auth-footer ops-topbar__actions">
            <a
              className="button"
              href={CONSUMER_LINKS.publicApp()}
              rel="noreferrer"
              target="_blank"
            >
              <OpsIcon name="external" size={14} />
              app
            </a>
            <button className="button" onClick={onThemeToggle} type="button">
              {appTheme === 'dark' ? 'light' : 'dark'}
            </button>
            <DocsButton className="button ops-docs-link" />
          </div>
        </form>
      </section>
    </main>
  );
}
