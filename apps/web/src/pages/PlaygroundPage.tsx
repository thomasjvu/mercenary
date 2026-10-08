import type { Provider, ProviderHealth } from '../api.js';
import { MercenaryWorkspace } from '../components/mercenary/MercenaryWorkspace.js';

export function PlaygroundPage({
  providers,
  providerHealth,
}: {
  providers: Provider[];
  providerHealth: ProviderHealth[];
}) {
  return (
    <section className="page-shell page-flat playground-page playground-page--raid">
      <MercenaryWorkspace embedded providerHealth={providerHealth} providers={providers} />
    </section>
  );
}
