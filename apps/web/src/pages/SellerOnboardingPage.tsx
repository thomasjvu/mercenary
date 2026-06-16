import { ModelPickerModal } from '../components/seller/ModelPickerModal.js';
import { SellerPathSwitcher } from '../components/seller/SellerPathSwitcher.js';
import {
  SellerEarningsPanel,
  SellerLiveMarketPanel,
} from '../components/seller/SellerDashboardPanels.js';
import { SellerCreateOfferWizard } from '../components/seller/SellerCreateOfferWizard.js';
import { SellerDemandPanel } from '../components/seller/SellerDemandPanel.js';
import { SellerOffersPanel } from '../components/seller/SellerOffersPanel.js';
import { SellerPublishSuccessPanel } from '../components/seller/SellerPublishSuccessPanel.js';
import { SellerSavedConfigsPanel } from '../components/seller/SellerSavedConfigsPanel.js';
import { WalletGate } from '../components/system/WalletGate.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { useSellerUpstreamOnboarding } from '../hooks/useSellerUpstreamOnboarding.js';
import type { AppRoute } from '../lib/app-routes.js';

type SellerOnboardingPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function SellerOnboardingPage({ onNavigate }: SellerOnboardingPageProps) {
  const state = useSellerUpstreamOnboarding();

  return (
    <section className="beta-page page-flat sell-page">
      <PageIntro
        aside={
          <SellerPathSwitcher
            active="upstream"
            compact
            onSelectHttp={() => onNavigate('/onboarding/seller/http')}
            onSelectUpstream={() => onNavigate('/onboarding/seller')}
          />
        }
        title="Sell inference"
      />

      <WalletGate message="Connect wallet before selling inference." />

      <div className="sell-dashboard">
        <div className="sell-dashboard__summary">
          <SellerEarningsPanel isAuthenticated={state.isAuthenticated} />
          <SellerLiveMarketPanel />
        </div>

        <SellerCreateOfferWizard state={state} />
        <SellerOffersPanel onNavigate={onNavigate} state={state} />
        <SellerSavedConfigsPanel state={state} />
        <SellerDemandPanel state={state} />
        {state.publishResult ? (
          <SellerPublishSuccessPanel onNavigate={onNavigate} publishResult={state.publishResult} />
        ) : null}
      </div>

      {state.pickerOpen ? (
        <ModelPickerModal
          models={state.models}
          provider={state.provider}
          selectedIds={state.selectedModelIds}
          onClose={() => state.setPickerOpen(false)}
          onConfirm={(modelIds) => {
            state.setSelectedModelIds(modelIds);
            state.setPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
