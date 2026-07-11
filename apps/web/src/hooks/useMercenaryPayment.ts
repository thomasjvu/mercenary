import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchSession, SESSION_SWR_KEY, updateBuyerApiKey } from '../api/auth.js';
import {
  getSavedBuyerApiKey,
  listSavedBuyerApiKeys,
  saveBuyerApiKey,
  type SavedBuyerApiKey,
} from '../lib/buyer-api-key-vault.js';
const API_KEY_STORAGE_KEY = 'bossraid.mercenary.apiKeyId';
const MIN_KEY_BUDGET_USD = 1;

export type MercenaryPaymentKeyOption = {
  id: string;
  label: string;
  prefix: string;
  spendLimitUsd?: number;
  spentUsd: number;
  hasSecret: boolean;
};

export function useMercenaryPayment() {
  const session = useSWR(SESSION_SWR_KEY, fetchSession);
  const [savedApiKeys, setSavedApiKeys] = useState<readonly SavedBuyerApiKey[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('');
  const [spendLimitDraft, setSpendLimitDraft] = useState(String(MIN_KEY_BUDGET_USD));
  const [budgetStatus, setBudgetStatus] = useState<string | null>(null);
  const [budgetPending, setBudgetPending] = useState(false);

  useEffect(() => {
    const vaultKeys = listSavedBuyerApiKeys();
    setSavedApiKeys(vaultKeys);

    const storedId = window.sessionStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
    if (storedId && vaultKeys.some((entry) => entry.id === storedId)) {
      setSelectedApiKeyId(storedId);
      return;
    }

    setSelectedApiKeyId('');
  }, []);

  const sessionKeys = session.data?.account?.apiKeys ?? [];

  const keyOptions = useMemo((): MercenaryPaymentKeyOption[] => {
    return sessionKeys
      .filter((key) => !key.revokedAt)
      .map((key) => {
        const saved = savedApiKeys.find((entry) => entry.id === key.id);
        return {
          id: key.id,
          label: key.name,
          prefix: key.prefix,
          spendLimitUsd: key.spendLimitUsd,
          spentUsd: key.spentUsd,
          hasSecret: Boolean(saved?.apiKey),
        };
      });
  }, [savedApiKeys, sessionKeys]);

  const selectedKey = useMemo(() => {
    if (!selectedApiKeyId) {
      return undefined;
    }
    return keyOptions.find((key) => key.id === selectedApiKeyId);
  }, [keyOptions, selectedApiKeyId]);

  const apiKeySecret = selectedApiKeyId ? getSavedBuyerApiKey(selectedApiKeyId)?.apiKey : undefined;

  const paymentMode = selectedApiKeyId ? ('api_key' as const) : ('wallet' as const);

  useEffect(() => {
    if (!selectedKey) {
      return;
    }
    setSpendLimitDraft(
      String(Math.max(selectedKey.spendLimitUsd ?? MIN_KEY_BUDGET_USD, MIN_KEY_BUDGET_USD))
    );
  }, [selectedKey?.id, selectedKey?.spendLimitUsd]);

  const selectApiKey = useCallback((keyId: string) => {
    setSelectedApiKeyId(keyId);
    setBudgetStatus(null);
    if (keyId) {
      window.sessionStorage.setItem(API_KEY_STORAGE_KEY, keyId);
      return;
    }
    window.sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  }, []);

  const saveSpendLimit = useCallback(async () => {
    if (!selectedApiKeyId) {
      return;
    }

    const parsed = Number(spendLimitDraft);
    if (!Number.isFinite(parsed) || parsed < MIN_KEY_BUDGET_USD) {
      setBudgetStatus(`Spend limit must be at least $${MIN_KEY_BUDGET_USD}.`);
      return;
    }

    if (selectedKey && parsed < selectedKey.spentUsd) {
      setBudgetStatus('Spend limit cannot be lower than amount already spent.');
      return;
    }

    setBudgetPending(true);
    setBudgetStatus(null);

    try {
      const updated = await updateBuyerApiKey(selectedApiKeyId, { spendLimitUsd: parsed });
      const saved = getSavedBuyerApiKey(selectedApiKeyId);
      if (saved) {
        saveBuyerApiKey({
          ...saved,
          spendLimitUsd: updated.key.spendLimitUsd,
        });
      }
      setSavedApiKeys(listSavedBuyerApiKeys());
      await session.mutate();
      setBudgetStatus('Saved');
      window.setTimeout(() => setBudgetStatus(null), 1200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update key budget.';
      setBudgetStatus(message);
    } finally {
      setBudgetPending(false);
    }
  }, [selectedApiKeyId, selectedKey, spendLimitDraft, session]);

  return {
    paymentMode,
    selectedApiKeyId,
    selectApiKey,
    keyOptions,
    selectedKey,
    apiKeySecret,
    spendLimitDraft,
    setSpendLimitDraft,
    saveSpendLimit,
    budgetStatus,
    budgetPending,
    sessionLoading: session.isLoading,
    isAuthenticated: session.data?.authenticated === true,
  };
}

export type MercenaryPaymentState = ReturnType<typeof useMercenaryPayment>;
