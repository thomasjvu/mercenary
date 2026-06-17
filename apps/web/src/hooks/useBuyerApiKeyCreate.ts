import { useState } from 'react';
import { createBuyerApiKey } from '../api';
import { saveBuyerApiKey } from '../lib/buyer-api-key-vault.js';

type UseBuyerApiKeyCreateOptions = {
  defaultName?: string;
  onCreated?: (apiKey: string) => void | Promise<void>;
};

export function useBuyerApiKeyCreate({
  defaultName = 'Buyer API key',
  onCreated,
}: UseBuyerApiKeyCreateOptions = {}) {
  const [keyName, setKeyName] = useState(defaultName);
  const [spendLimit, setSpendLimit] = useState('5');
  const [createdKey, setCreatedKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function createKey() {
    setKeyError(null);
    setPending(true);

    try {
      const created = await createBuyerApiKey({
        name: keyName.trim() || defaultName,
        spendLimitUsd: spendLimit.trim() ? Number(spendLimit) : undefined,
      });
      saveBuyerApiKey({
        id: created.key.id,
        name: created.key.name,
        prefix: created.key.prefix,
        apiKey: created.apiKey,
        createdAt: created.key.createdAt,
        spendLimitUsd: created.key.spendLimitUsd,
      });
      setCreatedKey(created.apiKey);
      await onCreated?.(created.apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create API key.';
      setKeyError(message);
    } finally {
      setPending(false);
    }
  }

  async function copyKey() {
    if (!createdKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return {
    keyName,
    setKeyName,
    spendLimit,
    setSpendLimit,
    createdKey,
    keyError,
    copied,
    pending,
    createKey,
    copyKey,
  };
}

export type BuyerApiKeyCreateState = ReturnType<typeof useBuyerApiKeyCreate>;
