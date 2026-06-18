import useSWR from 'swr';
import type { Provider } from '../api/client.js';
import { fetchJson } from '../api/client.js';
import type { AppRoute } from '../lib/app-routes.js';

type PartyQuestPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function PartyQuestPage({ onNavigate }: PartyQuestPageProps) {
  const providers = useSWR<Provider[]>('/v1/providers?sourceType=party_quest', (path: string) =>
    fetchJson<Provider[]>(path)
  );

  return (
    <section className="page-shell page-flat party-quest-page">
      <header className="bounties-page__header">
        <div>
          <p className="eyebrow">Party Quest bridge</p>
          <h1>Send configured formations on Boss Raids.</h1>
          <p className="lede">
            Party Quest squads register as Boss Raid providers. Pin a provider id in raid policy or
            launch from Mercenary with hostContext.host = party-quest.
          </p>
        </div>
        <button className="btn btn--yellow" type="button" onClick={() => onNavigate('/mercenary')}>
          open Mercenary
        </button>
      </header>

      <div className="page-panel">
        <p className="eyebrow">party-quest providers</p>
        <ul className="bounties-list">
          {(providers.data ?? []).map((provider) => (
            <li key={provider.providerId} className="bounties-card bounties-card--static">
              <span className="bounties-card__title">{provider.displayName}</span>
              <span className="bounties-card__meta">{provider.providerId}</span>
              {provider.source?.partyQuestFormationId ? (
                <span className="bounties-card__meta">
                  formation {provider.source.partyQuestFormationId}
                </span>
              ) : null}
              <pre className="code-block code-block--compact">{`raidPolicy.requiredProviderIds: ["${provider.providerId}"]
hostContext.host: "party-quest"`}</pre>
            </li>
          ))}
        </ul>
        {!providers.data?.length ? <p>No Party Quest providers discovered yet.</p> : null}
      </div>
    </section>
  );
}
