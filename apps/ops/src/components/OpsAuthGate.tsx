import { NETWORK } from '@bossraid/constants';
import { DocsButton } from '@bossraid/ui';

const PUBLIC_WEB_URL = `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_WEB_PORT}`;

export function OpsAuthGate({
  adminTokenInput,
  authPending,
  authMessage,
  onTokenChange,
  onSubmit,
}: {
  adminTokenInput: string;
  authPending: boolean;
  authMessage: string | null;
  onTokenChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <main className="ops-shell ops-shell--locked">
      <div className="ops-bg-grid" aria-hidden="true" />
      <section className="ops-auth-card">
        <div className="ops-auth-card__copy">
          <p className="ops-label">Boss Raid Ops</p>
          <h1>Unlock the internal control plane.</h1>
          <p className="ops-lede">
            Internal operator surface for live raids, provider health, replay, and settlement
            review. Paste your server-side admin token to unlock the session.
          </p>
          <p className="quiet-note">
            Looking for the public marketplace and playground? Open{' '}
            <a className="ops-public-link" href={PUBLIC_WEB_URL}>
              {PUBLIC_WEB_URL}
            </a>
            . Port 4174 is ops only.
          </p>
        </div>

        <form
          className="ops-auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="ops-auth-field">
            <span className="ops-label">admin token</span>
            <input
              autoComplete="current-password"
              className="search ops-auth-input"
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="paste BOSSRAID_ADMIN_TOKEN"
              type="password"
              value={adminTokenInput}
            />
          </label>
          <div className="ops-auth-actions">
            <button className="button button--primary" disabled={authPending} type="submit">
              {authPending ? 'unlocking' : 'unlock ops'}
            </button>
            <DocsButton className="button ops-docs-link" />
          </div>
          {authMessage ? (
            <p className="error-note">{authMessage}</p>
          ) : (
            <p className="quiet-note">Session cookie lifetime follows the API runtime TTL.</p>
          )}
        </form>
      </section>
    </main>
  );
}
