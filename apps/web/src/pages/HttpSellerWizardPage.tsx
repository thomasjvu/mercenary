import { SellerPathSwitcher } from '../components/seller/SellerPathSwitcher.js';
import {
  HttpSellerRegisterSection,
  HttpSellerRegistrationForm,
} from '../components/seller/HttpSellerRegistrationForm.js';
import { HttpSellerPublishSuccess } from '../components/seller/HttpSellerPublishSuccess.js';
import { FlowSection } from '../components/system/FlowSection.js';
import { FormStatus } from '../components/system/FormField.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { WalletGate } from '../components/system/WalletGate.js';
import { useHttpSellerRegistration } from '../hooks/useHttpSellerRegistration.js';
import type { AppRoute } from '../lib/app-routes.js';

type HttpSellerWizardPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function HttpSellerWizardPage({ onNavigate }: HttpSellerWizardPageProps) {
  const state = useHttpSellerRegistration();

  return (
    <section className="beta-page page-flat flow-page seller-wizard seller-wizard--flow">
      <PageIntro
        actions={
          <SellerPathSwitcher
            active="http"
            compact
            onSelectHttp={() => onNavigate('/onboarding/seller/http')}
            onSelectUpstream={() => onNavigate('/onboarding/seller')}
          />
        }
        title="HTTP worker"
      />

      <WalletGate message="Connect wallet before registering a worker." />

      <div className="flow-stack seller-wizard__steps">
        <FlowSection done={state.isAuthenticated} step="01" title="Connect wallet">
          {state.isAuthenticated ? (
            <FormStatus>{state.session?.wallet}</FormStatus>
          ) : (
            <FormStatus>{state.status}</FormStatus>
          )}
        </FlowSection>

        <FlowSection step="02" title="Endpoint details">
          <HttpSellerRegistrationForm state={state} />
        </FlowSection>

        <FlowSection done={Boolean(state.publishResult)} step="03" title="Register">
          <HttpSellerRegisterSection state={state} />
        </FlowSection>

        {state.publishResult ? (
          <HttpSellerPublishSuccess
            onNavigate={onNavigate}
            providerId={state.publishResult.providerId}
            verificationStatus={state.publishResult.verificationStatus}
          />
        ) : null}
      </div>
    </section>
  );
}
