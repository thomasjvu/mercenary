import { useState } from 'react';
import { createSellerProvider } from '../api/auth.js';
import { useWalletAuth } from './useWalletAuth.js';

const AGENT_FRAMEWORK_OPTIONS = [
  ['codex', 'codex'],
  ['claude_code', 'claude code'],
  ['openclaw', 'openclaw'],
  ['grok', 'grok / xAI'],
  ['glm', 'glm / Z.ai'],
  ['custom', 'custom'],
] as const;

export function useHttpSellerRegistration() {
  const { session, status, setStatus, isAuthenticated } = useWalletAuth(
    'Connect wallet in the sidebar before registering an HTTP worker.'
  );
  const [name, setName] = useState('HTTP inference seller');
  const [endpoint, setEndpoint] = useState('');
  const [agentFramework, setAgentFramework] = useState('custom');
  const [modelProvider, setModelProvider] = useState('openai');
  const [modelId, setModelId] = useState('gpt-5.5');
  const [pricePerTaskUsd, setPricePerTaskUsd] = useState('0.25');
  const [authToken, setAuthToken] = useState('');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{
    providerId: string;
    verificationStatus: string;
  } | null>(null);

  async function handleRegister() {
    if (!endpoint.trim()) {
      setError('Endpoint URL is required.');
      return;
    }

    setPending(true);
    setError(null);
    setPublishResult(null);
    setStatus('Registering HTTP worker...');

    try {
      const result = await createSellerProvider({
        name: name.trim() || 'HTTP inference seller',
        endpoint: endpoint.trim(),
        agentFramework,
        modelProvider: modelProvider.trim() || undefined,
        modelId: modelId.trim() || undefined,
        outputTypes: ['text', 'json'],
        pricing: {
          mode: 'task',
          pricePerTaskUsd: Number(pricePerTaskUsd) || 0.25,
          currency: 'USD',
        },
        payoutWallet: payoutWallet.trim() || session?.wallet,
        auth: authToken.trim() ? { type: 'bearer', token: authToken.trim() } : { type: 'none' },
      });

      setPublishResult({
        providerId: result.provider.providerId,
        verificationStatus: result.provider.verification?.status ?? 'pending',
      });
      setStatus('HTTP worker registered and verified.');
    } catch (registerError) {
      const message =
        registerError instanceof Error ? registerError.message : 'Registration failed.';
      setError(message);
      setStatus(message);
    } finally {
      setPending(false);
    }
  }

  return {
    session,
    status,
    isAuthenticated,
    name,
    setName,
    endpoint,
    setEndpoint,
    agentFramework,
    setAgentFramework,
    modelProvider,
    setModelProvider,
    modelId,
    setModelId,
    pricePerTaskUsd,
    setPricePerTaskUsd,
    authToken,
    setAuthToken,
    payoutWallet,
    setPayoutWallet,
    pending,
    error,
    publishResult,
    handleRegister,
    agentFrameworkOptions: AGENT_FRAMEWORK_OPTIONS,
  };
}

export type HttpSellerRegistrationState = ReturnType<typeof useHttpSellerRegistration>;
