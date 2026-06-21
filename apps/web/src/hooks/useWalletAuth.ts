import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  createAuthNonce,
  deleteSession,
  fetchSession,
  verifyAuth,
  SESSION_SWR_KEY,
  type PublicSession,
} from '../api';
import { connectWalletForAuth, formatWalletError } from '../lib/ethereum-provider.js';

export function useWalletAuth(initialStatus: string) {
  const session = useSWR(SESSION_SWR_KEY, fetchSession, { revalidateOnFocus: true });
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (session.data?.authenticated && status === initialStatus) {
      setStatus('');
    }
  }, [initialStatus, session.data?.authenticated, status]);

  const connectWallet = useCallback(async () => {
    setStatus('Connecting MetaMask...');
    try {
      const { client, address } = await connectWalletForAuth();
      const nonce = await createAuthNonce(address);
      const signature = await client.signMessage({
        account: address,
        message: nonce.message,
      });
      const verified = await verifyAuth(address, nonce.message, signature);
      await session.mutate(verified, false);
      setStatus(`Signed in as ${address}.`);
    } catch (error) {
      setStatus(formatWalletError(error));
    }
  }, [session]);

  const signOut = useCallback(async () => {
    await deleteSession();
    await session.mutate();
    setStatus('Signed out.');
  }, [session]);

  const setSession = useCallback(
    async (value: PublicSession) => {
      await session.mutate(value, false);
    },
    [session]
  );

  return {
    session: session.data?.authenticated ? session.data : null,
    setSession,
    status,
    setStatus,
    connectWallet,
    signOut,
    sessionLoading: session.isLoading,
    isAuthenticated: Boolean(session.data?.authenticated),
  };
}
