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
      <section className="ops-auth-card rx-control-pane">
        <p className="ops-label rx-control-pane__band">Boss Raid Ops</p>

        <form
          className="ops-auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="ops-auth-card__copy rx-control-pane__body">
            <h1>Unlock control plane.</h1>
            <p className="ops-lede">Live raids, provider health, replay, settlement.</p>
            <p className="quiet-note">
              Public surface:{' '}
              <a className="ops-public-link" href={PUBLIC_WEB_URL}>
                {PUBLIC_WEB_URL}
              </a>
            </p>
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
            {authMessage ? <p className="error-note">{authMessage}</p> : null}
          </div>

          <div className="rx-control-pane__unlock">
            <button
              className="button button--primary ops-auth-unlock rx-spacebar-clip"
              disabled={authPending}
              type="submit"
            >
              {authPending ? 'unlocking' : 'unlock ops'}
            </button>
          </div>

          <div className="rx-control-pane__footer">
            <DocsButton className="button ops-docs-link" />
            {!authMessage ? (
              <p className="quiet-note">Session cookie lifetime follows the API runtime TTL.</p>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}
