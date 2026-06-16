import type { Provider, ProviderHealth } from '../api.js';
import { ApiReadinessBanner } from '../components/system/ApiReadinessBanner.js';
import { DemoPage } from './DemoPage.js';

type MercenaryPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  apiError?: unknown;
};

export function MercenaryPage({ providers, providerHealth, apiError }: MercenaryPageProps) {
  return (
    <section className="beta-page page-flat mercenary-page">
      <ApiReadinessBanner error={apiError} label="Mercenary API unavailable" />
      <DemoPage providerHealth={providerHealth} providers={providers} />
    </section>
  );
}
