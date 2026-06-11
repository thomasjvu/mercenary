import { useCallback, useState } from 'react';
import { createAuthNonce, verifyAuth, type PublicSession } from '../api';

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function readEthereum(): EthereumProvider | undefined {
  return (globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum;
}

export function useWalletAuth(initialStatus: string) {
  const [session, setSession] = useState<PublicSession | null>(null);
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
    setSession(verified);
    setStatus(`Signed in as ${wallet}.`);
  }, []);

  return { session, setSession, status, setStatus, connectWallet };
}
