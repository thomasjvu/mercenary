import { Icon } from '@iconify/react';
import { FlowSection } from '../components/system/FlowSection.js';
import { FormInput, FormStatus } from '../components/system/FormField.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { PaymentFeesCallout } from '../components/system/PaymentFeesCallout.js';
import { WalletGate } from '../components/system/WalletGate.js';
import { CurlQuickstart } from '../components/terminal/CurlQuickstart.js';
import { useBuyerApiKeyOnboarding } from '../hooks/useBuyerApiKeyOnboarding.js';

export function BuyerOnboardingPage() {
  const state = useBuyerApiKeyOnboarding();

  return (
    <section className="page-shell page-flat flow-page buyer-page">
      <PageIntro title="Buy inference" />

      <WalletGate />
      <PaymentFeesCallout role="buyer" />

      <div className="buyer-page__layout">
        <div className="buyer-page__main">
          <FlowSection done={state.isAuthenticated} step="01" title="Connect wallet">
            {state.isAuthenticated ? (
              <FormStatus>{state.session?.wallet}</FormStatus>
            ) : (
              <FormStatus>{state.status}</FormStatus>
            )}
          </FlowSection>

          <FlowSection done={Boolean(state.apiKey)} step="02" title="Create API key">
            <FormInput
              label="key name"
              onChange={(event) => state.setKeyName(event.target.value)}
              value={state.keyName}
            />
            <FormInput
              inputMode="decimal"
              label="spend cap usd"
              onChange={(event) => state.setSpendLimit(event.target.value)}
              value={state.spendLimit}
            />
            <button
              className="button button--primary rx-spacebar-clip buyer-page__create-key"
              disabled={!state.session?.authenticated}
              onClick={() => void state.createKey()}
              type="button"
            >
              create key
            </button>
            {state.keyError ? <FormStatus tone="error">{state.keyError}</FormStatus> : null}
            {state.apiKey ? (
              <div className="code-panel-row">
                <pre className="code-panel">{state.apiKey}</pre>
                <button className="button" onClick={() => void state.copyKey()} type="button">
                  <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:copy-solid" />
                  {state.copied ? 'copied' : 'copy key'}
                </button>
              </div>
            ) : null}
          </FlowSection>
        </div>

        <div className="buyer-page__aside">
          <FlowSection step="03" title="Send a test request">
            <CurlQuickstart code={state.curl} compact runHref="/playground" />
          </FlowSection>
        </div>
      </div>
    </section>
  );
}
