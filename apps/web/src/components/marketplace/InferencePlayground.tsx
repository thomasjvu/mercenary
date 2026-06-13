import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE } from '../../api/client.js';
import { verifyMarketplaceTeeAttestation } from '../../api/marketplace-tee.js';
import { fetchMarkets, runInferenceChatCompletion } from '../../api/marketplace.js';

import { TerminalCodePanel } from '../terminal/TerminalCodePanel.js';
import { UpstreamTeeVerificationPanel } from '../trust/UpstreamTeeVerificationPanel.js';
import { ModelCombobox } from './ModelCombobox.js';

const API_KEY_STORAGE_KEY = 'bossraid.playground.apiKey';
const UPSTREAM_KEY_STORAGE_KEY = 'bossraid.playground.upstreamKey';

type InferencePlaygroundProps = {
  initialModelId?: string;
};

type ModelOption = {
  modelId: string;
  displayName: string;
  modelProvider: string;
  liveSellers: number;
  referenceRateUsd: number | null;
  teeAttested: boolean;
  e2ee: boolean;
  attestationVendor: string;
};

export function InferencePlayground({ initialModelId }: InferencePlaygroundProps) {
  const markets = useSWR('playground-markets', () => fetchMarkets());
  const catalogById = useMemo(
    () => new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry])),
    []
  );

  const modelOptions = useMemo<ModelOption[]>(() => {
    return (markets.data?.data ?? [])
      .map((market) => {
        const catalog = catalogById.get(market.modelId);
        return {
          modelId: market.modelId,
          displayName: catalog?.displayName ?? market.modelId,
          modelProvider: market.modelProvider ?? catalog?.modelProvider ?? 'unknown',
          liveSellers: market.activeProviderCount ?? market.providerCount ?? 0,
          referenceRateUsd: market.cheapestRateUsd,
          teeAttested: catalog?.teeAttested ?? false,
          e2ee: catalog?.e2ee ?? false,
          attestationVendor: catalog?.attestationVendor ?? catalog?.modelProvider ?? 'venice',
        };
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [catalogById, markets.data?.data]);

  const [model, setModel] = useState(initialModelId ?? '');
  const [prompt, setPrompt] = useState('One-line launch status update.');
  const [apiKey, setApiKey] = useState('');
  const [upstreamApiKey, setUpstreamApiKey] = useState('');
  const [privacyMode, setPrivacyMode] = useState<'prefer' | 'strict'>('prefer');
  const [maxBudget, setMaxBudget] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'curl' | 'response'>('curl');
  const [teeStatus, setTeeStatus] = useState<string | null>(null);

  const selectedModel = modelOptions.find((option) => option.modelId === model);
  const attestationProvider =
    selectedModel?.attestationVendor && isUpstreamProviderId(selectedModel.attestationVendor)
      ? selectedModel.attestationVendor
      : 'venice';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
    }
    const storedUpstream = window.sessionStorage.getItem(UPSTREAM_KEY_STORAGE_KEY);
    if (storedUpstream) {
      setUpstreamApiKey(storedUpstream);
    }
  }, []);

  useEffect(() => {
    if (!model && modelOptions.length > 0) {
      const preferredLive =
        modelOptions.find((option) => option.liveSellers > 0)?.modelId ?? modelOptions[0].modelId;
      setModel(
        initialModelId && modelOptions.some((option) => option.modelId === initialModelId)
          ? initialModelId
          : preferredLive
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

  const strictE2ee = privacyMode === 'strict' && selectedModel?.e2ee;
  const curlSnippet = strictE2ee
    ? `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "x-bossraid-upstream-api-key: vn_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${model || 'e2ee-gemma-4-26b-a4b-uncensored-p'}","stream":true,"messages":[{"role":"user","content":"${prompt.replace(/"/g, '\\"')}"}],"raid_policy":{"privacy_mode":"strict"}}'`
    : `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "authorization: Bearer br_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${model || 'venice-uncensored-1-2'}","stream":true,"messages":[{"role":"user","content":"${prompt.replace(/"/g, '\\"')}"}],"raid_policy":{"max_total_cost":${maxBudget || '1'},"privacy_mode":"${privacyMode}"}}'`;

  const responseSnippet = rawResponse
    ? JSON.stringify(rawResponse, null, 2)
    : responseText
      ? JSON.stringify({ content: responseText }, null, 2)
      : 'Run inference to see response metadata here.';

  async function handleRun() {
    if (!apiKey.trim() && !strictE2ee) {
      setError('Add a buyer API key from account onboarding.');
      return;
    }
    if (strictE2ee && !upstreamApiKey.trim()) {
      setError(
        'Strict E2EE models need an upstream API key (or configure BOSSRAID_VENICE_API_KEY server-side).'
      );
      return;
    }

    if (!model.trim()) {
      setError('Pick a model.');
      return;
    }

    if (selectedModel && selectedModel.liveSellers === 0 && privacyMode !== 'strict') {
      setError('No live sellers for this model yet. Pick a model with active sellers.');
      return;
    }

    setPending(true);
    setError(null);
    setResponseText(null);
    setRawResponse(null);
    setTeeStatus(null);

    try {
      if (apiKey.trim()) {
        window.sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      }
      if (upstreamApiKey.trim()) {
        window.sessionStorage.setItem(UPSTREAM_KEY_STORAGE_KEY, upstreamApiKey.trim());
      }

      if (selectedModel?.teeAttested || strictE2ee) {
        const attestation = await verifyMarketplaceTeeAttestation({
          provider: attestationProvider,
          modelId: model.trim(),
        });
        setTeeStatus(
          attestation.valid
            ? strictE2ee
              ? 'TEE verified · server E2EE relay'
              : 'TEE verified'
            : 'TEE verification failed'
        );
      }

      const result = await runInferenceChatCompletion({
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
        prompt: prompt.trim(),
        maxTotalCost: Number(maxBudget) || 1,
        privacyMode,
        upstreamApiKey: strictE2ee ? upstreamApiKey.trim() : undefined,
      });
      setResponseText(result.content);
      setRawResponse(result.raw);
      const receiptId = (result.raw as { privacy?: { receiptId?: string } })?.privacy?.receiptId;
      if (receiptId) {
        setTeeStatus(`TEE verified · receipt ${receiptId}`);
      }
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
            <ModelCombobox
              onChange={setModel}
              options={modelOptions}
              placeholder="loading models..."
              value={model}
            />
          </label>

          {selectedModel ? (
            <p className="inference-playground__meta">
              {selectedModel.liveSellers > 0
                ? `${selectedModel.liveSellers} live seller${selectedModel.liveSellers === 1 ? '' : 's'}`
                : 'catalog reference only'}
              {selectedModel.referenceRateUsd != null
                ? ` · from $${selectedModel.referenceRateUsd.toFixed(3)}`
                : ''}
              {selectedModel.teeAttested ? ' · tee' : ''}
              {selectedModel.e2ee ? ' · e2ee' : ''}
            </p>
          ) : null}

          <label className="field">
            <span>privacy mode</span>
            <select
              onChange={(event) => setPrivacyMode(event.target.value as 'prefer' | 'strict')}
              value={privacyMode}
            >
              <option value="prefer">prefer private</option>
              <option value="strict">strict private</option>
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

          {selectedModel?.e2ee ? (
            <label className="field">
              <span>upstream API key (E2EE)</span>
              <input
                autoComplete="off"
                onChange={(event) => setUpstreamApiKey(event.target.value)}
                placeholder="required for strict E2EE"
                spellCheck={false}
                type="password"
                value={upstreamApiKey}
              />
            </label>
          ) : null}

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

          {selectedModel?.teeAttested || selectedModel?.e2ee ? (
            <UpstreamTeeVerificationPanel
              compact
              e2ee={selectedModel.e2ee}
              modelId={model}
              provider={attestationProvider}
              teeAttested={selectedModel.teeAttested}
            />
          ) : null}

          <button
            className="button button--primary"
            disabled={pending}
            onClick={() => void handleRun()}
            type="button"
          >
            {pending
              ? 'routing...'
              : privacyMode === 'strict' && selectedModel?.e2ee
                ? 'run e2ee'
                : 'run'}
          </button>

          {teeStatus ? <p className="form-status">{teeStatus}</p> : null}
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
