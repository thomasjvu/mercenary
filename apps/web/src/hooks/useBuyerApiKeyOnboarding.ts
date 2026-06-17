import { fetchSession } from '../api';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';
import { useBuyerApiKeyCreate } from './useBuyerApiKeyCreate.js';
import { useWalletAuth } from './useWalletAuth.js';

export function useBuyerApiKeyOnboarding() {
  const { session, setSession, status, setStatus, isAuthenticated } = useWalletAuth(
    'Connect wallet to create a buyer account.'
  );
  const keyCreate = useBuyerApiKeyCreate({
    defaultName: 'Beta buyer key',
    onCreated: async () => {
      await setSession(await fetchSession());
      setStatus('API key created.');
    },
  });

  const curl = buildInferenceCurlSnippet({
    apiBase: '/api',
    model: 'gpt-5.5',
    apiKey: keyCreate.createdKey || 'br_...',
    relativePath: true,
  });

  return {
    session,
    status,
    isAuthenticated,
    apiKey: keyCreate.createdKey,
    keyName: keyCreate.keyName,
    setKeyName: keyCreate.setKeyName,
    spendLimit: keyCreate.spendLimit,
    setSpendLimit: keyCreate.setSpendLimit,
    keyError: keyCreate.keyError,
    copied: keyCreate.copied,
    curl,
    createKey: keyCreate.createKey,
    copyKey: keyCreate.copyKey,
  };
}

export type BuyerApiKeyOnboardingState = ReturnType<typeof useBuyerApiKeyOnboarding>;
