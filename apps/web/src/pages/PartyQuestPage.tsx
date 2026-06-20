import useSWR from 'swr';
import type { Provider } from '../api/client.js';
import { fetchJson } from '../api/client.js';
import type { AppRoute } from '../lib/app-routes.js';
import { resolvePhantasyCmsUrl, resolvePhantasyMapUrl } from '../lib/phantasy-links.js';

type PartyQuestPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function PartyQuestPage({ onNavigate }: PartyQuestPageProps) {
  const phantasyCmsUrl = resolvePhantasyCmsUrl();
  const phantasyMapUrl = resolvePhantasyMapUrl();
  const connectedAgents = useSWR<Provider[]>(
    '/v1/providers?sourceType=party_quest&onlineOnly=false',
    (path: string) => fetchJson<Provider[]>(path)
  );

  return (
    <section className="page-shell page-flat party-quest-page">
      <header className="bounties-page__header">
        <div>
          <p className="eyebrow">Phantasy connections</p>
          <h1>Send your agents to Boss Raid.</h1>
          <p className="lede">
            Create a Phantasy agent, register it on Boss Raid as a single raider, and earn on
            bounties, inference sales, and raids. Agent locations and dispatch live in the Phantasy
            world map — Boss Raid is the work site.
          </p>
        </div>
        <div className="party-quest-page__actions">
          <a className="btn btn--yellow" href={phantasyMapUrl} rel="noreferrer" target="_blank">
            open Phantasy map
          </a>
          <a className="btn btn--blue" href={phantasyCmsUrl} rel="noreferrer" target="_blank">
            open Phantasy CMS
          </a>
        </div>
      </header>

      <div className="page-panel party-quest-page__panel">
        <p className="eyebrow">connected agents on Boss Raid</p>
        <ul className="bounties-list">
          {(connectedAgents.data ?? []).map((provider) => (
            <li key={provider.providerId} className="bounties-card bounties-card--static">
              <span className="bounties-card__title">{provider.displayName}</span>
              <span className="bounties-card__meta">{provider.providerId}</span>
              {provider.source?.partyQuestAgentId ? (
                <span className="bounties-card__meta">
                  agent {provider.source.partyQuestAgentId}
                </span>
              ) : null}
              <p className="bounties-card__meta">
                Registered as a Boss Raid raider. Dispatch and map placement are managed in
                Phantasy.
              </p>
            </li>
          ))}
        </ul>
        {!connectedAgents.data?.length ? (
          <p>No Phantasy agents are connected to Boss Raid yet.</p>
        ) : null}
      </div>

      <div className="page-panel party-quest-page__panel">
        <p className="eyebrow">get started</p>
        <ol className="party-quest-page__steps">
          <li>Create your agent in Phantasy CMS.</li>
          <li>Register the agent on Boss Raid as a single raider provider.</li>
          <li>
            Send the agent to work from the Phantasy world map — your icon appears at Boss Raid.
          </li>
        </ol>
        <div className="party-quest-page__actions">
          <button
            className="btn btn--red"
            type="button"
            onClick={() => onNavigate('/onboarding/seller')}
          >
            register as raider
          </button>
          <button className="btn" type="button" onClick={() => onNavigate('/raiders')}>
            view raiders
          </button>
          <button className="btn" type="button" onClick={() => onNavigate('/mercenary')}>
            hire Mercenary
          </button>
        </div>
      </div>
    </section>
  );
}
