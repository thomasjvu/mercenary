import { createSmartAccountWalletClient, ROBINHOOD_CHAIN_ID_NUM } from '@bossraid/smart-pay';

export type EthereumProvider = {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EthereumProvider;
};

const METAMASK_RDNS = 'io.metamask';

function readWindowEthereum(): EthereumProvider | undefined {
  return (globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum;
}

function pickMetaMaskFromLegacy(ethereum: EthereumProvider): EthereumProvider {
  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    const metaMask = ethereum.providers.find((provider) => provider.isMetaMask);
    return metaMask ?? ethereum.providers[0];
  }

  return ethereum;
}

function isMetaMaskProvider(detail: Eip6963ProviderDetail): boolean {
  return (
    detail.info.rdns === METAMASK_RDNS ||
    detail.info.name.toLowerCase().includes('metamask') ||
    Boolean(detail.provider.isMetaMask)
  );
}

export async function discoverWalletProvider(): Promise<EthereumProvider> {
  if (typeof window === 'undefined') {
    throw new Error('Wallet connection is only available in the browser.');
  }

  const announced: Eip6963ProviderDetail[] = [];

  function handleAnnounce(event: Event) {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (detail?.provider) {
      announced.push(detail);
    }
  }

  window.addEventListener('eip6963:announceProvider', handleAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  await new Promise((resolve) => window.setTimeout(resolve, 250));
  window.removeEventListener('eip6963:announceProvider', handleAnnounce);

  const metaMask = announced.find(isMetaMaskProvider);
  if (metaMask) {
    return metaMask.provider;
  }

  if (announced.length > 0) {
    return announced[0].provider;
  }

  const legacy = readWindowEthereum();
  if (legacy) {
    return pickMetaMaskFromLegacy(legacy);
  }

  throw new Error('Install MetaMask to connect a wallet.');
}

export async function ensureWalletChain(
  provider: EthereumProvider,
  chainId = ROBINHOOD_CHAIN_ID_NUM
): Promise<void> {
  const hexChainId = `0x${chainId.toString(16)}`;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4001) {
      throw new Error('Wallet chain switch cancelled.', { cause: error });
    }

    if (code !== 4902) {
      throw error instanceof Error ? error : new Error('Wallet chain switch failed.');
    }

    throw new Error('Add Base network in MetaMask to use Smart Accounts payments.', {
      cause: error,
    });
  }
}

async function connectWalletClient(chainId = ROBINHOOD_CHAIN_ID_NUM, switchChain = false) {
  const provider = await discoverWalletProvider();
  if (switchChain) {
    await ensureWalletChain(provider, chainId);
  }

  const client = createSmartAccountWalletClient(provider, chainId);
  const [address] = await client.requestAddresses();

  if (!address) {
    throw new Error('Wallet did not return an account.');
  }

  return { provider, client, address: address as `0x${string}` };
}

export async function connectWalletForAuth(chainId = ROBINHOOD_CHAIN_ID_NUM) {
  return connectWalletClient(chainId, false);
}

export async function connectSmartAccountWallet(chainId = ROBINHOOD_CHAIN_ID_NUM) {
  return connectWalletClient(chainId, true);
}

export function formatWalletError(error: unknown): string {
  if (error instanceof Error) {
    if (/user rejected|request rejected|cancelled/i.test(error.message)) {
      return 'Wallet request cancelled.';
    }

    return error.message;
  }

  return 'Wallet connection failed.';
}
