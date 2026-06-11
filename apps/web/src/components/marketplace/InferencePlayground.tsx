import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE } from '../../api/client.js';
import { fetchMarkets, runInferenceChatCompletion } from '../../api/marketplace.js';
import { fetchSession } from '../../api/auth.js';

const API_KEY_STORAGE_KEY = 'bossraid.playground.apiKey';

type InferencePlaygroundProps = {
  initialModelId?: string;
};

export function InferencePlayground({ initialModelId }: InferencePlaygroundProps) {
  const markets = useSWR('playground-markets', () => fetchMarkets());
  const session = useSWR('playground-session', fetchSession);
  const modelOptions = useMemo(
    () => (markets.data?.data ?? []).map((market) => market.modelId),
    [markets.data?.data]
  );

  const [model, setModel] = useState(initialModelId ?? '');
  const [prompt, setPrompt] = useState('Write a one-line status update for a marketplace launch.');
  const [apiKey, setApiKey] = useState('');
  const [maxBudget, setMaxBudget] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
    }
  }, []);

  useEffect(() => {
    if (!model && modelOptions.length > 0) {
      setModel(modelOptions[0]);
    }
  }, [model, modelOptions]);

  useEffect(() => {
    if (initialModelId) {
      setModel(initialModelId);
    }
  }, [initialModelId]);

  const curlSnippet = `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "authorization: Bearer br_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${model || 'gpt-5.5'}","messages":[{"role":"user","content":"${prompt.replace(/"/g, '\\"')}"}],"raid_policy":{"max_total_cost":${maxBudget || '1'},"privacy_mode":"prefer"}}'`;

  async function handleRun() {
    if (!apiKey.trim()) {
      setError('Paste a buyer API key (br_...) from account onboarding.');
      return;
    }

    if (!model.trim()) {
      setError('Select a model from the live catalog.');
      return;
    }

    setPending(true);
    setError(null);
    setResponseText(null);
    setRawResponse(null);

    try {
      window.sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      const result = await runInferenceChatCompletion({
        apiKey: apiKey.trim(),
        model: model.trim(),
        prompt: prompt.trim(),
        maxTotalCost: Number(maxBudget) || 1,
      });
      setResponseText(result.content);
      setRawResponse(result.raw);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Inference request failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="inference-playground">
      <div className="inference-playground__grid">
        <div className="beta-panel inference-playground__panel">
          <p className="eyebrow">try inference</p>
          <h2>Send one discounted model call.</h2>
          <p className="inference-playground__lede">
            Uses the same `POST /v1/inference/chat/completions` lane as production. Requires a buyer
            API key; wallet session {session.data?.authenticated ? 'is active' : 'not required'}.
          </p>

          <label className="field">
            <span>model</span>
            <select onChange={(event) => setModel(event.target.value)} value={model}>
              {modelOptions.length === 0 ? <option value="">loading models...</option> : null}
              {modelOptions.map((modelId) => (
                <option key={modelId} value={modelId}>
                  {modelId}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>buyer API key</span>
            <input
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="br_..."
              spellCheck={false}
              type="password"
              value={apiKey}
            />
          </label>

          <label className="field">
            <span>max budget (USD)</span>
            <input
              inputMode="decimal"
              onChange={(event) => setMaxBudget(event.target.value)}
              value={maxBudget}
            />
          </label>

          <label className="field">
            <span>prompt</span>
            <textarea onChange={(event) => setPrompt(event.target.value)} rows={5} value={prompt} />
          </label>

          <button
            className="button button--primary"
            disabled={pending}
            onClick={() => void handleRun()}
            type="button"
          >
            {pending ? 'routing...' : 'run inference'}
          </button>

          {error ? <p className="error-note">{error}</p> : null}
          {responseText ? (
            <article className="inference-playground__response">
              <p className="eyebrow">assistant</p>
              <pre>{responseText}</pre>
            </article>
          ) : null}
        </div>

        <aside className="beta-panel inference-playground__panel">
          <p className="eyebrow">production curl</p>
          <pre className="code-panel">{curlSnippet}</pre>
          {rawResponse ? (
            <>
              <p className="eyebrow">raw response</p>
              <pre className="code-panel code-panel--compact">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </>
          ) : (
            <p className="quiet-note">
              Response metadata (seller, quote, savings) appears here after a successful run.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
