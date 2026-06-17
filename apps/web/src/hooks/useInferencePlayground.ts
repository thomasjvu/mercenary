import { isUpstreamProviderId } from '@bossraid/constants';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE } from '../api/client.js';
import { verifyMarketplaceTeeAttestation } from '../api/marketplace-tee.js';
import { fetchMarkets, runInferenceChatCompletion } from '../api/marketplace.js';
import {
  getSavedBuyerApiKey,
  listSavedBuyerApiKeys,
  type SavedBuyerApiKey,
} from '../lib/buyer-api-key-vault.js';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';
import { buildPlaygroundModelOptions } from '../lib/playground-models.js';
import { resolveProviderBrand } from '../lib/provider-brand.js';

const API_KEY_STORAGE_KEY = 'bossraid.playground.apiKey';
const UPSTREAM_KEY_STORAGE_KEY = 'bossraid.playground.upstreamKey';

const PRIVACY_MODE_OPTIONS = [
  ['prefer', 'prefer private'],
  ['strict', 'strict private'],
] as const;

type UseInferencePlaygroundOptions = {
  initialModelId?: string;
};

export type PlaygroundUserMessage = {
  message: string;
  variant: 'guide' | 'error';
};

export function useInferencePlayground({ initialModelId }: UseInferencePlaygroundOptions = {}) {
  const markets = useSWR('playground-markets', () => fetchMarkets());

  const modelOptions = useMemo(
    () => buildPlaygroundModelOptions(markets.data?.data ?? []),
    [markets.data?.data]
  );

  const [model, setModel] = useState(initialModelId ?? '');
  const [providerFilter, setProviderFilter] = useState('');
  const [prompt, setPrompt] = useState('One-line launch status update.');
  const [savedApiKeys, setSavedApiKeys] = useState<readonly SavedBuyerApiKey[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [upstreamApiKey, setUpstreamApiKey] = useState('');
  const [privacyMode, setPrivacyMode] = useState<'prefer' | 'strict'>('prefer');
  const [maxBudget, setMaxBudget] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlaygroundUserMessage | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'curl' | 'response'>('curl');
  const [teeStatus, setTeeStatus] = useState<string | null>(null);

  const providerChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const option of modelOptions) {
      counts.set(option.modelProvider, (counts.get(option.modelProvider) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) =>
        resolveProviderBrand(left[0]).label.localeCompare(resolveProviderBrand(right[0]).label)
      )
      .map(([id, count]) => ({
        id,
        label: resolveProviderBrand(id).label,
        count,
      }));
  }, [modelOptions]);

  const filteredModelOptions = useMemo(() => {
    if (!providerFilter) {
      return modelOptions;
    }
    return modelOptions.filter((option) => option.modelProvider === providerFilter);
  }, [modelOptions, providerFilter]);

  const selectedModel = modelOptions.find((option) => option.modelId === model);
  const attestationProvider =
    selectedModel?.attestationVendor && isUpstreamProviderId(selectedModel.attestationVendor)
      ? selectedModel.attestationVendor
      : 'venice';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const vaultKeys = listSavedBuyerApiKeys();
    setSavedApiKeys(vaultKeys);

    const stored = window.sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      const matched = vaultKeys.find((entry) => entry.apiKey === stored);
      if (matched) {
        setSelectedApiKeyId(matched.id);
      }
    } else if (vaultKeys.length > 0) {
      setSelectedApiKeyId(vaultKeys[0].id);
      setApiKey(vaultKeys[0].apiKey);
    }

    const storedUpstream = window.sessionStorage.getItem(UPSTREAM_KEY_STORAGE_KEY);
    if (storedUpstream) {
      setUpstreamApiKey(storedUpstream);
    }
  }, []);

  function selectSavedApiKey(keyId: string) {
    setSelectedApiKeyId(keyId);
    if (!keyId) {
      return;
    }

    const saved = getSavedBuyerApiKey(keyId);
    if (saved) {
      setApiKey(saved.apiKey);
    }
  }

  useEffect(() => {
    if (!model && filteredModelOptions.length > 0) {
      const preferredLive =
        filteredModelOptions.find((option) => option.liveSellers > 0)?.modelId ??
        filteredModelOptions[0].modelId;
      setModel(
        initialModelId && filteredModelOptions.some((option) => option.modelId === initialModelId)
          ? initialModelId
          : preferredLive
      );
    }
  }, [initialModelId, model, filteredModelOptions]);

  useEffect(() => {
    if (!model || filteredModelOptions.some((option) => option.modelId === model)) {
      return;
    }

    const preferredLive =
      filteredModelOptions.find((option) => option.liveSellers > 0)?.modelId ??
      filteredModelOptions[0]?.modelId;
    if (preferredLive) {
      setModel(preferredLive);
    }
  }, [filteredModelOptions, model]);

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
  const curlSnippet = buildInferenceCurlSnippet({
    apiBase: API_BASE,
    model: model || (strictE2ee ? 'e2ee-gemma-4-26b-a4b-uncensored-p' : 'venice-uncensored-1-2'),
    prompt,
    stream: true,
    maxBudgetUsd: maxBudget || '1',
    privacyMode,
    strictE2ee,
    relativePath: true,
  });

  const responseSnippet = rawResponse
    ? JSON.stringify(rawResponse, null, 2)
    : responseText
      ? JSON.stringify({ content: responseText }, null, 2)
      : 'Run inference to see response metadata here.';

  const modelSummary = selectedModel
    ? [
        selectedModel.liveSellers > 0 ? `${selectedModel.liveSellers} live` : 'catalog only',
        selectedModel.referenceRateUsd != null
          ? `from $${selectedModel.referenceRateUsd.toFixed(3)}`
          : null,
        selectedModel.teeAttested ? 'tee' : null,
        selectedModel.e2ee ? 'e2ee' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'pick a model';

  const providerPlaceholder = markets.isLoading ? 'loading...' : 'any provider';
  const modelPlaceholder = markets.isLoading
    ? 'loading...'
    : filteredModelOptions.length === 0
      ? 'no models'
      : 'search models...';

  async function handleRun() {
    if (!apiKey.trim() && !strictE2ee) {
      setError({
        message: 'Add a buyer API key from account or load a saved key below.',
        variant: 'guide',
      });
      return;
    }
    if (strictE2ee && !upstreamApiKey.trim()) {
      setError({
        message:
          'Strict E2EE models need an upstream API key (or configure BOSSRAID_VENICE_API_KEY server-side).',
        variant: 'guide',
      });
      return;
    }

    if (!model.trim()) {
      setError({ message: 'Pick a model.', variant: 'guide' });
      return;
    }

    if (selectedModel && selectedModel.liveSellers === 0 && privacyMode !== 'strict') {
      setError({
        message: 'No live sellers for this model yet. Pick a model with active sellers.',
        variant: 'guide',
      });
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
      setError({
        message: runError instanceof Error ? runError.message : 'Inference request failed.',
        variant: 'error',
      });
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

  return {
    markets,
    providerChoices,
    filteredModelOptions,
    selectedModel,
    attestationProvider,
    model,
    setModel,
    providerFilter,
    setProviderFilter,
    prompt,
    setPrompt,
    savedApiKeys,
    selectedApiKeyId,
    selectSavedApiKey,
    apiKey,
    setApiKey,
    upstreamApiKey,
    setUpstreamApiKey,
    privacyMode,
    setPrivacyMode,
    maxBudget,
    setMaxBudget,
    pending,
    error,
    responseText,
    rawResponse,
    copiedKey,
    activePanel,
    setActivePanel,
    teeStatus,
    strictE2ee,
    curlSnippet,
    responseSnippet,
    modelSummary,
    providerPlaceholder,
    modelPlaceholder,
    privacyModeOptions: PRIVACY_MODE_OPTIONS,
    handleRun,
    copySnippet,
  };
}

export type InferencePlaygroundState = ReturnType<typeof useInferencePlayground>;
