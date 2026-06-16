import type { AppRoute } from '../lib/app-routes.js';
import { AccountBuyerPanel } from '../components/account/AccountBuyerPanel.js';
import { AccountSellerPanel } from '../components/account/AccountSellerPanel.js';
import { AccountWalletPanel } from '../components/account/AccountWalletPanel.js';
import { FlowPanel, FlowTabs } from '../components/system/FlowTabs.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { ACCOUNT_TABS, useAccountPage } from '../hooks/useAccountPage.js';

type AccountPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function AccountPage({ onNavigate }: AccountPageProps) {
  const state = useAccountPage({ onNavigate });

  if (state.session.isLoading || !state.session.data?.authenticated) {
    return null;
  }

  return (
    <section className="page-shell page-flat flow-page">
      <PageIntro
        actions={
          <button className="button" onClick={() => void state.signOut()} type="button">
            sign out
          </button>
        }
        title="Account"
      />

      <>
        <FlowTabs
          activeId={state.activeTab}
          onChange={(id) => state.setActiveTab(id as (typeof ACCOUNT_TABS)[number]['id'])}
          tabs={ACCOUNT_TABS}
        />

        <FlowPanel active={state.activeTab === 'wallet'} id="account-wallet">
          <AccountWalletPanel state={state} />
        </FlowPanel>

        <FlowPanel active={state.activeTab === 'buyer'} id="account-buyer">
          <AccountBuyerPanel state={state} />
        </FlowPanel>

        <FlowPanel active={state.activeTab === 'seller'} id="account-seller">
          <AccountSellerPanel state={state} />
        </FlowPanel>
      </>
    </section>
  );
}
