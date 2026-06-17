import { FormInput, FormStatus } from '../system/FormField.js';
import type { AccountPageState } from '../../hooks/useAccountPage.js';

type AccountWalletPanelProps = {
  state: AccountPageState;
};

export function AccountWalletPanel({ state }: AccountWalletPanelProps) {
  const session = state.session.data;
  if (!session) {
    return null;
  }

  return (
    <div className="account-overview">
      <article className="flow-card">
        <p className="eyebrow">balance</p>
        <p className="account-balance__amount">${(session.account?.balanceUsd ?? 0).toFixed(2)}</p>
        <p className="quiet-note">{session.wallet}</p>
        {(session.account?.totalSavingsUsd ?? 0) > 0 ? (
          <p className="quiet-note">
            ${session.account?.totalSavingsUsd?.toFixed(2)} benchmark savings
          </p>
        ) : null}
        <p className="quiet-note">
          Top-ups require a verified x402 USDC payment from your connected wallet.
        </p>
        <form
          className="account-balance-fund"
          onSubmit={(event) => {
            event.preventDefault();
            void state.topUpBalance();
          }}
        >
          <FormInput
            inputMode="decimal"
            label="top up usd"
            min="0.01"
            onChange={(event) => state.setFundAmount(event.target.value)}
            step="0.01"
            type="number"
            value={state.fundAmount}
          />
          <button className="button button--primary" disabled={state.smartPay.busy} type="submit">
            pay with wallet
          </button>
          {state.fundStatus ? <FormStatus>{state.fundStatus}</FormStatus> : null}
        </form>
      </article>

      <article className="flow-card">
        <p className="eyebrow">account subscription</p>
        <p className="quiet-note">
          Weekly MetaMask permission authorizes x402 payments for marketplace inference and raids.
        </p>
        <p className="quiet-note">{state.smartPay.status}</p>
        <div className="mercenary-action-row">
          <button
            className="button"
            disabled={state.smartPay.busy}
            onClick={() => void state.smartPay.connectWallet()}
            type="button"
          >
            connect MetaMask
          </button>
          <button
            className="button button--primary"
            disabled={state.smartPay.busy}
            onClick={() =>
              void state.smartPay.grantSubscription().then(() => state.session.mutate())
            }
            type="button"
          >
            subscribe
          </button>
        </div>
        {state.smartPay.subscription ? (
          <>
            <FormStatus>
              ${state.smartPay.subscription.weeklyBudgetUsd.toFixed(2)} USDC / week until{' '}
              {new Date(state.smartPay.subscription.expiresAt).toLocaleString()}.
            </FormStatus>
            <button
              className="button"
              disabled={state.smartPay.busy}
              onClick={() => void state.smartPay.clearSubscription()}
              type="button"
            >
              clear subscription
            </button>
          </>
        ) : null}
      </article>
    </div>
  );
}
