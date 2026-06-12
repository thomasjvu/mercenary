import { InferencePlayground } from '../components/marketplace/InferencePlayground.js';

export function PlaygroundPage({ initialModelId }: { initialModelId?: string }) {
  return (
    <section className="beta-page playground-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">playground</p>
          <h1>Try discount inference.</h1>
          <p className="lede">Paste a buyer API key and send one routed call.</p>
        </div>
      </header>

      <InferencePlayground initialModelId={initialModelId} />
    </section>
  );
}
