import type { Provider, ProviderHealth } from '../api.js';
import { MercenaryWorkspace } from '../components/mercenary/MercenaryWorkspace.js';

type MercenaryPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
};

export function MercenaryPage({ providers, providerHealth }: MercenaryPageProps) {
  return (
    <section className="page-shell page-flat mercenary-page">
      <MercenaryWorkspace providerHealth={providerHealth} providers={providers} />
    </section>
  );
}
