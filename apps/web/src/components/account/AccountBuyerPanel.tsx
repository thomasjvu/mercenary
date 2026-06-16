import type { AccountPageState } from '../../hooks/useAccountPage.js';

type AccountBuyerPanelProps = {
  state: AccountPageState;
};

export function AccountBuyerPanel({ state }: AccountBuyerPanelProps) {
  return (
    <>
      <article className="flow-card">
        <p className="eyebrow">api keys</p>
        {state.apiKeys.length === 0 ? (
          <p className="quiet-note">No API keys yet.</p>
        ) : (
          <div className="table-list">
            {state.apiKeys.map((key) => (
              <div className="table-row" key={key.id}>
                <span>{key.name}</span>
                <span>{key.prefix}</span>
                <span>${key.spentUsd.toFixed(2)}</span>
                <span>{key.revokedAt ? 'revoked' : 'active'}</span>
                {!key.revokedAt ? (
                  <button
                    className="button"
                    onClick={() => void state.revokeKey(key.id)}
                    type="button"
                  >
                    revoke
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="flow-card">
        <p className="eyebrow">recent purchases</p>
        {state.purchaseRows.length === 0 ? (
          <p className="quiet-note">No inference purchases yet.</p>
        ) : (
          <div className="table-list">
            {state.purchaseRows.map((purchase) => (
              <div className="table-row" key={purchase.id}>
                <span>{purchase.modelId ?? 'model n/a'}</span>
                <span>${purchase.costUsd.toFixed(3)}</span>
                <span>{new Date(purchase.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
        {(state.purchases.data?.totalSavingsUsd ?? 0) > 0 ? (
          <p className="quiet-note">
            ${state.purchases.data?.totalSavingsUsd.toFixed(2)} total benchmark savings
          </p>
        ) : null}
      </article>
    </>
  );
}
