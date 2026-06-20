import type { Provider, ProviderHealth } from '../api.js';
import { MercenaryWorkspace } from '../components/mercenary/MercenaryWorkspace.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { InferencePlayground } from '../components/marketplace/InferencePlayground.js';
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
    <section
      className={`page-shell page-flat playground-page${mode === 'raid' ? ' playground-page--raid' : ''}`}
    >
      <PageIntro aside={<PlaygroundModeTabs mode={mode} onModeChange={onModeChange} />} />

      {mode === 'raid' ? (
        <MercenaryWorkspace embedded providerHealth={providerHealth} providers={providers} />
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
