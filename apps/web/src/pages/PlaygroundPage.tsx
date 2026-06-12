import type { Provider, ProviderHealth } from '../api.js';
import { ApiReadinessBanner } from '../components/system/ApiReadinessBanner.js';
import { InferencePlayground } from '../components/marketplace/InferencePlayground.js';
import { DemoPage } from './DemoPage.js';
import type { PlaygroundMode } from '../lib/playground-routing.js';

type PlaygroundPageProps = {
  mode: PlaygroundMode;
  initialModelId?: string;
  providers: Provider[];
  providerHealth: ProviderHealth[];
  onModeChange: (mode: PlaygroundMode) => void;
};

export function PlaygroundPage({
  mode,
  initialModelId,
  providers,
  providerHealth,
  onModeChange,
}: PlaygroundPageProps) {
  return (
    <section className="beta-page playground-page">
      <header className="playground-page__header">
        <div>
          <p className="eyebrow">playground</p>
          <h1>Try models and raids.</h1>
        </div>
        <div className="playground-page__modes" role="tablist" aria-label="Playground mode">
          <button
            aria-selected={mode === 'inference'}
            className={`playground-page__mode${mode === 'inference' ? ' playground-page__mode--active' : ''}`}
            onClick={() => onModeChange('inference')}
            type="button"
          >
            inference
          </button>
          <button
            aria-selected={mode === 'raid'}
            className={`playground-page__mode${mode === 'raid' ? ' playground-page__mode--active' : ''}`}
            onClick={() => onModeChange('raid')}
            type="button"
          >
            mercenary raid
          </button>
        </div>
      </header>

      <ApiReadinessBanner label="Playground API unavailable" />

      {mode === 'raid' ? (
        <DemoPage providerHealth={providerHealth} providers={providers} embedded />
      ) : (
        <InferencePlayground initialModelId={initialModelId} />
      )}
    </section>
  );
}
