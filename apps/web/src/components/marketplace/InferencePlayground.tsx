import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE } from '../../api/client.js';
import { fetchMarkets, runInferenceChatCompletion } from '../../api/marketplace.js';
import { resolveProviderBrand } from '../../lib/provider-brand.js';
import { TerminalCodePanel } from '../terminal/TerminalCodePanel.js';

const API_KEY_STORAGE_KEY = 'bossraid.playground.apiKey';

type InferencePlaygroundProps = {
  initialModelId?: string;
};

type ModelOption = {
  modelId: string;
  displayName: string;
  modelProvider: string;
  liveSellers: number;
  referenceRateUsd: number | null;
};

function groupLabelForProvider(modelProvider: string): string {
  if (modelProvider === 'venice') {
    return 'Venice';
  }
  if (modelProvider === 'redpill' || modelProvider === 'phala') {
    return 'RedPill / Phala';
  }
  return resolveProviderBrand(modelProvider).label;
}

export function InferencePlayground({ initialModelId }: InferencePlaygroundProps) {
  const markets = useSWR('playground-markets', () => fetchMarkets());
  const catalogById = useMemo(
    () => new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry])),
    []
  );

  const modelOptions = useMemo<ModelOption[]>(() => {
    return (markets.data?.data ?? [])
      .map((market) => ({
        modelId: market.modelId,
        displayName: catalogById.get(market.modelId)?.displayName ?? market.modelId,
        modelProvider:
          market.modelProvider ?? catalogById.get(market.modelId)?.modelProvider ?? 'unknown',
        liveSellers: market.activeProviderCount ?? market.providerCount ?? 0,
        referenceRateUsd: market.cheapestRateUsd,
      }))
      .sort(
        (left, right) =>
          groupLabelForProvider(left.modelProvider).localeCompare(
            groupLabelForProvider(right.modelProvider)
          ) || left.displayName.localeCompare(right.displayName)
      );
  }, [catalogById, markets.data?.data]);

  const modelGroups = useMemo(() => {
    const groups = new Map<string, ModelOption[]>();
    for (const option of modelOptions) {
      const label = groupLabelForProvider(option.modelProvider);
      groups.set(label, [...(groups.get(label) ?? []), option]);
    }
    return [...groups.entries()];
  }, [modelOptions]);

  const [model, setModel] = useState(initialModelId ?? '');
  const [prompt, setPrompt] = useState('One-line launch status update.');
  const [apiKey, setApiKey] = useState('');
  const [maxBudget, setMaxBudget] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'curl' | 'response'>('curl');

  const selectedModel = modelOptions.find((option) => option.modelId === model);

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
      setModel(
        initialModelId && modelOptions.some((option) => option.modelId === initialModelId)
          ? initialModelId
          : modelOptions[0].modelId
      );
    }
  }, [initialModelId, model, modelOptions]);

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
  -d '{"model":"${model || 'venice-uncensored-1-2'}","messages":[{"role":"user","content":"${prompt.replace(/"/g, '\\"')}"}],"raid_policy":{"max_total_cost":${maxBudget || '1'},"privacy_mode":"prefer"}}'`;

  const responseSnippet = rawResponse
    ? JSON.stringify(rawResponse, null, 2)
    : responseText
      ? JSON.stringify({ content: responseText }, null, 2)
      : 'Run inference to see response metadata here.';

  async function handleRun() {
    if (!apiKey.trim()) {
      setError('Add a buyer API key from account onboarding.');
      return;
    }

    if (!model.trim()) {
      setError('Pick a model.');
      return;
    }

    if (selectedModel && selectedModel.liveSellers === 0) {
      setError('No live sellers for this model yet. Pick a model with active sellers.');
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
          <label className="field">
            <span>model</span>
            <select onChange={(event) => setModel(event.target.value)} value={model}>
              {modelOptions.length === 0 ? <option value="">loading...</option> : null}
              {modelGroups.map(([groupLabel, options]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {options.map((option) => (
                    <option key={option.modelId} value={option.modelId}>
                      {option.displayName}
                      {option.liveSellers > 0 ? '' : ' · catalog'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {selectedModel ? (
            <p className="inference-playground__meta">
              {selectedModel.liveSellers > 0
                ? `${selectedModel.liveSellers} live seller${selectedModel.liveSellers === 1 ? '' : 's'}`
                : 'catalog reference only'}
              {selectedModel.referenceRateUsd != null
                ? ` · from $${selectedModel.referenceRateUsd.toFixed(3)}`
                : ''}
            </p>
          ) : null}

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
            <span>budget usd</span>
            <input
              inputMode="decimal"
              onChange={(event) => setMaxBudget(event.target.value)}
              value={maxBudget}
            />
          </label>

          <label className="field">
            <span>prompt</span>
            <textarea onChange={(event) => setPrompt(event.target.value)} rows={4} value={prompt} />
          </label>

          <button
            className="button button--primary"
            disabled={pending}
            onClick={() => void handleRun()}
            type="button"
          >
            {pending ? 'routing...' : 'run'}
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
            <p className="eyebrow">request</p>
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
              label="curl"
              note="openai-compatible"
              code={curlSnippet}
              theme="chat"
              layer={activePanel === 'curl' ? 'front' : 'mid'}
              onFocus={() => setActivePanel('curl')}
              actionLabel={copiedKey === 'curl-panel' ? 'copied' : 'copy'}
              onAction={() => void copySnippet('curl-panel', curlSnippet)}
            />
            <TerminalCodePanel
              label="response"
              note="seller metadata"
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
