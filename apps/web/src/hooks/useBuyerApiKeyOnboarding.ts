import { useState } from 'react';
import { createBuyerApiKey, fetchSession } from '../api';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';
import { useWalletAuth } from './useWalletAuth.js';

export function useBuyerApiKeyOnboarding() {
  const { session, setSession, status, setStatus, isAuthenticated } = useWalletAuth(
    'Connect wallet to create a buyer account.'
  );
  const [apiKey, setApiKey] = useState('');
  const [keyName, setKeyName] = useState('Beta buyer key');
  const [spendLimit, setSpendLimit] = useState('5');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setKeyError(null);
    try {
      const created = await createBuyerApiKey({
        name: keyName,
        spendLimitUsd: spendLimit.trim() ? Number(spendLimit) : undefined,
      });
      setApiKey(created.apiKey);
      await setSession(await fetchSession());
      setStatus('API key created.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create API key.';
      setKeyError(message);
      setStatus(message);
    }
  }

  async function copyKey() {
    if (!apiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  const curl = buildInferenceCurlSnippet({
    apiBase: '/api',
    model: 'gpt-5.5',
    apiKey: apiKey || 'br_...',
    relativePath: true,
  });

  return {
    session,
    status,
    isAuthenticated,
    apiKey,
    keyName,
    setKeyName,
    spendLimit,
    setSpendLimit,
    keyError,
    copied,
    curl,
    createKey,
    copyKey,
  };
}

export type BuyerApiKeyOnboardingState = ReturnType<typeof useBuyerApiKeyOnboarding>;
