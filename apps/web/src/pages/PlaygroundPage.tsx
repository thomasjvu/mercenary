import { InferencePlayground } from '../components/marketplace/InferencePlayground.js';

export function PlaygroundPage({ initialModelId }: { initialModelId?: string }) {
  return (
    <section className="beta-page playground-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">playground</p>
          <h1>Try discount inference in-browser.</h1>
          <p className="lede">
            Pick a live model, paste a buyer API key, and send one routed call. Use the curl panel
            beside it when you are ready to integrate in production.
          </p>
        </div>
      </header>

      <InferencePlayground initialModelId={initialModelId} />
    </section>
  );
}
