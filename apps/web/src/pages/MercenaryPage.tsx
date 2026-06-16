import type { Provider, ProviderHealth } from '../api.js';
import { MercenaryWorkspace } from '../components/mercenary/MercenaryWorkspace.js';
import { ApiReadinessBanner } from '../components/system/ApiReadinessBanner.js';

type MercenaryPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  apiError?: unknown;
};

export function MercenaryPage({ providers, providerHealth, apiError }: MercenaryPageProps) {
  return (
    <section className="page-shell page-flat mercenary-page">
      <ApiReadinessBanner error={apiError} label="Mercenary API unavailable" />
      <MercenaryWorkspace providerHealth={providerHealth} providers={providers} />
    </section>
  );
}
