import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE } from '../../api/client.js';
import { fetchMarkets, runInferenceChatCompletion } from '../../api/marketplace.js';
import { TerminalCodePanel } from '../terminal/TerminalCodePanel.js';

const API_KEY_STORAGE_KEY = 'bossraid.playground.apiKey';

type InferencePlaygroundProps = {
  initialModelId?: string;
};

export function InferencePlayground({ initialModelId }: InferencePlaygroundProps) {
  const markets = useSWR('playground-markets', () => fetchMarkets());
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'curl' | 'response'>('curl');

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

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  const curlSnippet = `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "authorization: Bearer br_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${model || 'gpt-5.5'}","messages":[{"role":"user","content":"${prompt.replace(/"/g, '\\"')}"}],"raid_policy":{"max_total_cost":${maxBudget || '1'},"privacy_mode":"prefer"}}'`;

  const responseSnippet = rawResponse
    ? JSON.stringify(rawResponse, null, 2)
    : responseText
      ? JSON.stringify({ content: responseText }, null, 2)
      : 'Run inference to see response metadata here.';

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
      setActivePanel('response');
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Inference request failed.');
    } finally {
      setPending(false);
    }
  }

  async function copySnippet(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch {
      setCopiedKey(null);
    }
  }

  return (
    <section className="inference-playground">
      <div className="inference-playground__grid">
        <div className="beta-panel inference-playground__panel">
          <p className="eyebrow">try inference</p>
          <h2>Send one call.</h2>
          <p className="inference-playground__lede">Buyer API key required.</p>

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

        <div className="terminal-deck inference-playground__deck">
          <div className="terminal-deck__header">
            <p className="eyebrow">live request</p>
            <div className="terminal-deck__tabs" role="tablist" aria-label="Playground output">
              <button
                className={`deck-tab deck-tab--chat ${activePanel === 'curl' ? 'deck-tab--active' : ''}`}
                onClick={() => setActivePanel('curl')}
                type="button"
              >
                curl
              </button>
              <button
                className={`deck-tab deck-tab--raid ${activePanel === 'response' ? 'deck-tab--active' : ''}`}
                onClick={() => setActivePanel('response')}
                type="button"
              >
                response
              </button>
            </div>
          </div>
          <div className="terminal-stack">
            <TerminalCodePanel
              label="production curl"
              note="openai-compatible"
              code={curlSnippet}
              theme="chat"
              layer={activePanel === 'curl' ? 'front' : 'mid'}
              onFocus={() => setActivePanel('curl')}
              actionLabel={copiedKey === 'curl-panel' ? 'copied' : 'copy'}
              onAction={() => void copySnippet('curl-panel', curlSnippet)}
            />
            <TerminalCodePanel
              label="raw response"
              note="seller + quote metadata"
              code={responseSnippet}
              theme="raid"
              layer={activePanel === 'response' ? 'front' : 'back'}
              onFocus={() => setActivePanel('response')}
              actionLabel={rawResponse && copiedKey === 'response-panel' ? 'copied' : 'copy'}
              onAction={
                rawResponse ? () => void copySnippet('response-panel', responseSnippet) : undefined
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
