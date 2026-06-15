import type { Provider, ProviderHealth } from '../api.js';
import { ApiReadinessBanner } from '../components/system/ApiReadinessBanner.js';
import { PageHero } from '../components/system/PageHero.js';
import { InferencePlayground } from '../components/marketplace/InferencePlayground.js';
import { DemoPage } from './DemoPage.js';
import type { PlaygroundMode } from '../lib/playground-routing.js';

type PlaygroundPageProps = {
  mode: PlaygroundMode;
  initialModelId?: string;
  providers: Provider[];
  providerHealth: ProviderHealth[];
  apiError?: unknown;
  onModeChange: (mode: PlaygroundMode) => void;
};

export function PlaygroundPage({
  mode,
  initialModelId,
  providers,
  providerHealth,
  apiError,
  onModeChange,
}: PlaygroundPageProps) {
  return (
    <section
      className={`beta-page playground-page${mode === 'raid' ? ' playground-page--raid' : ''}`}
    >
      {mode !== 'raid' ? (
        <PageHero
          aside={<PlaygroundModeTabs mode={mode} onModeChange={onModeChange} />}
          compact
          eyebrow="playground"
          lede="Run inference or spawn a mercenary raid."
          title="Try models and raids."
        />
      ) : (
        <div className="playground-page__mode-bar">
          <PlaygroundModeTabs mode={mode} onModeChange={onModeChange} />
        </div>
      )}

      <ApiReadinessBanner error={apiError} label="Playground API unavailable" />

      {mode === 'raid' ? (
        <DemoPage providerHealth={providerHealth} providers={providers} embedded />
      ) : (
        <InferencePlayground initialModelId={initialModelId} />
      )}
    </section>
  );
}

function PlaygroundModeTabs({
  mode,
  onModeChange,
}: {
  mode: PlaygroundMode;
  onModeChange: (mode: PlaygroundMode) => void;
}) {
  return (
    <div className="terminal-deck__tabs" role="tablist" aria-label="Playground mode">
      <button
        aria-selected={mode === 'inference'}
        className={`deck-tab deck-tab--chat${mode === 'inference' ? ' deck-tab--active' : ''}`}
        onClick={() => onModeChange('inference')}
        type="button"
      >
        inference
      </button>
      <button
        aria-selected={mode === 'raid'}
        className={`deck-tab deck-tab--raid${mode === 'raid' ? ' deck-tab--active' : ''}`}
        onClick={() => onModeChange('raid')}
        type="button"
      >
        mercenary raid
      </button>
    </div>
  );
}
