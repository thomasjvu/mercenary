import { Icon } from '@iconify/react';
import { FormInput, FormStatus } from '../system/FormField.js';
import type { AccountPageState } from '../../hooks/useAccountPage.js';

type AccountBuyerPanelProps = {
  state: AccountPageState;
};

export function AccountBuyerPanel({ state }: AccountBuyerPanelProps) {
  const keyCreate = state.keyCreate;

  return (
    <>
      <article className="flow-card">
        <p className="eyebrow">create api key</p>
        <p className="quiet-note">
          Keys are shown once. Saved keys can be loaded on the playground.
        </p>
        <FormInput
          label="key name"
          onChange={(event) => keyCreate.setKeyName(event.target.value)}
          value={keyCreate.keyName}
        />
        <FormInput
          inputMode="decimal"
          label="spend cap usd"
          onChange={(event) => keyCreate.setSpendLimit(event.target.value)}
          value={keyCreate.spendLimit}
        />
        <button
          className="button button--primary"
          disabled={keyCreate.pending}
          onClick={() => void keyCreate.createKey()}
          type="button"
        >
          {keyCreate.pending ? 'creating...' : 'create key'}
        </button>
        {keyCreate.keyError ? <FormStatus tone="error">{keyCreate.keyError}</FormStatus> : null}
        {keyCreate.createdKey ? (
          <div className="code-panel-row">
            <pre className="code-panel">{keyCreate.createdKey}</pre>
            <button className="button" onClick={() => void keyCreate.copyKey()} type="button">
              <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:copy-solid" />
              {keyCreate.copied ? 'copied' : 'copy key'}
            </button>
          </div>
        ) : null}
      </article>

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
                <span>
                  ${key.spentUsd.toFixed(2)}
                  {key.spendLimitUsd != null ? ` / $${key.spendLimitUsd.toFixed(2)}` : ''}
                </span>
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
        <p className="eyebrow">billing activity</p>
        <p className="quiet-note">
          Charges, hold releases (abort / zero-success), and refunds for this wallet.
        </p>
        {state.purchaseRows.length === 0 ? (
          <p className="quiet-note">No billing activity yet.</p>
        ) : (
          <div className="table-list">
            {state.purchaseRows.map((purchase) => {
              const status = purchase.status ?? 'charged';
              const amountLabel =
                status === 'charged'
                  ? `$${purchase.costUsd.toFixed(3)}`
                  : status === 'refunded'
                    ? `refund $${(purchase.costUsd || purchase.reservedUsd || 0).toFixed(3)}`
                    : `released $${(purchase.reservedUsd ?? 0).toFixed(3)}`;
              return (
                <div className="table-row" key={purchase.id}>
                  <span>{purchase.modelId ?? purchase.route}</span>
                  <span>{status.replace('_', ' ')}</span>
                  <span>{amountLabel}</span>
                  <span title={purchase.reason ?? purchase.raidId}>
                    {new Date(purchase.createdAt).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {(state.purchases.data?.totalSpentUsd ?? 0) > 0 ? (
          <p className="quiet-note">
            ${state.purchases.data?.totalSpentUsd.toFixed(2)} charged
            {(state.purchases.data?.totalRefundedOrReleasedUsd ?? 0) > 0
              ? ` · $${state.purchases.data?.totalRefundedOrReleasedUsd?.toFixed(2)} released/refunded`
              : ''}
            {(state.purchases.data?.totalSavingsUsd ?? 0) > 0
              ? ` · $${state.purchases.data?.totalSavingsUsd.toFixed(2)} benchmark savings`
              : ''}
          </p>
        ) : null}
      </article>
    </>
  );
}
