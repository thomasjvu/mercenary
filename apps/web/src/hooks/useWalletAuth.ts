import { useCallback, useState } from 'react';
import useSWR from 'swr';
import {
  createAuthNonce,
  deleteSession,
  fetchSession,
  verifyAuth,
  type PublicSession,
} from '../api';

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function readEthereum(): EthereumProvider | undefined {
  return (globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum;
}

export function useWalletAuth(initialStatus: string) {
  const session = useSWR('wallet-session', fetchSession, { revalidateOnFocus: true });
  const [status, setStatus] = useState(initialStatus);

  const connectWallet = useCallback(async () => {
    const ethereum = readEthereum();
    if (!ethereum) {
      setStatus('No wallet provider found. Install a wallet that supports personal_sign.');
      return;
    }

    const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[];
    const wallet = accounts[0];
    if (!wallet) {
      setStatus('Wallet did not return an account.');
      return;
    }

    const nonce = await createAuthNonce(wallet);
    const signature = (await ethereum.request({
      method: 'personal_sign',
      params: [nonce.message, wallet],
    })) as string;
    const verified = await verifyAuth(wallet, nonce.message, signature);
    await session.mutate(verified, false);
    setStatus(`Signed in as ${wallet}.`);
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
