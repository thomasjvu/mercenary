import { x402Erc7710Client, type x402SchemeNetworkClientLike } from '@metamask/x402';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { SchemeNetworkClient } from '@x402/core/types';
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner, type ClientEvmSigner } from '@x402/evm';
import { ExactEvmSchemeV1 } from '@x402/evm/v1';
import type { DelegationChainEntry } from '@bossraid/shared-types';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { resolveDelegationManager } from './config.js';
import { encodeBase64Json } from './encoding.js';
import type { PaidFetchOptions } from './types.js';
import type { SmartAccountWalletClient } from './wallet.js';

const V1_EVM_NETWORKS = ['base-sepolia', 'base', 'sepolia', 'ethereum'] as const;

function buildPaymentFetch(
  schemeClientFactory: () => SchemeNetworkClient,
  signer: ClientEvmSigner,
  delegationHeader?: string
): typeof fetch {
  const coreClient = new x402Client();
  for (const network of V1_EVM_NETWORKS) {
    coreClient.registerV1(network, new ExactEvmSchemeV1(signer));
  }
  coreClient.register('eip155:*', schemeClientFactory());
  const httpClient = new x402HTTPClient(coreClient);
  const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

  return async (input, init) => {
    const headers = new Headers(init?.headers ?? {});
    if (delegationHeader) {
      headers.set('X-BossRaid-Delegation-Chain', delegationHeader);
    }

    return fetchWithPayment(input, {
      ...init,
      headers,
    });
  };
}

async function resolveWalletAddress(
  walletClient: SmartAccountWalletClient
): Promise<`0x${string}`> {
  const accounts = await walletClient.getAddresses();
  const wallet = accounts[0];
  if (!wallet) {
    throw new Error('Wallet did not return an account.');
  }
  return wallet;
}

function buildWalletSigner(
  walletClient: SmartAccountWalletClient,
  walletAddress: `0x${string}`
): ClientEvmSigner {
  return toClientEvmSigner({
    address: walletAddress,
    async signTypedData(message) {
      return walletClient.signTypedData({
        account: walletAddress,
        domain: message.domain,
        types: message.types,
        primaryType: message.primaryType,
        message: message.message,
      });
    },
  });
}

function buildPrivateKeySigner(privateKey: `0x${string}`): ClientEvmSigner {
  const account = privateKeyToAccount(privateKey);
  return toClientEvmSigner({
    address: account.address,
    signTypedData: (message) =>
      account.signTypedData({
        domain: message.domain,
        types: message.types,
        primaryType: message.primaryType,
        message: message.message,
      }),
  });
}

function createErc7710Client(
  options: PaidFetchOptions,
  fallbackClient: SchemeNetworkClient
): x402Erc7710Client {
  const permissionFrom = options.permissionFrom;
  const permissionContext = options.permissionContext;
  if (!permissionFrom || !permissionContext) {
    throw new Error('permissionFrom and permissionContext are required for ERC-7710 payments.');
  }

  const delegationManager = resolveDelegationManager(options.delegationManager);

  return new x402Erc7710Client({
    delegationProvider: async () => ({
      delegationManager,
      permissionContext: permissionContext as Hex,
      delegator: permissionFrom,
    }),
    fallbackClient: fallbackClient as x402SchemeNetworkClientLike,
  });
}

export async function createPaidFetch(
  walletClient: SmartAccountWalletClient,
  options: PaidFetchOptions = {}
): Promise<typeof fetch> {
  const walletAddress = await resolveWalletAddress(walletClient);
  const sessionAccount = options.sessionAccount ?? walletAddress;
  const delegationHeader = options.delegationChain?.length
    ? encodeBase64Json(options.delegationChain)
    : undefined;
  const walletSigner = buildWalletSigner(walletClient, walletAddress);
  const sessionSigner = buildWalletSigner(walletClient, sessionAccount);
  const fallbackClient = new ExactEvmScheme(walletSigner);

  if (options.permissionContext && options.permissionFrom) {
    return buildPaymentFetch(
      () => createErc7710Client(options, fallbackClient),
      sessionSigner,
      delegationHeader
    );
  }

  return buildPaymentFetch(
    () => new ExactEvmScheme(sessionSigner),
    sessionSigner,
    delegationHeader
  );
}

export function createNodePaidFetch(
  privateKey: `0x${string}`,
  options: PaidFetchOptions = {}
): typeof fetch {
  const signer = buildPrivateKeySigner(privateKey);
  const delegationHeader = options.delegationChain?.length
    ? encodeBase64Json(options.delegationChain)
    : undefined;
  const fallbackClient = new ExactEvmScheme(signer);

  if (options.permissionContext && options.permissionFrom) {
    return buildPaymentFetch(
      () => createErc7710Client(options, fallbackClient),
      signer,
      delegationHeader
    );
  }

  return buildPaymentFetch(() => new ExactEvmScheme(signer), signer, delegationHeader);
}

export function encodeDelegationChain(chain: DelegationChainEntry[]): string {
  return encodeBase64Json(chain);
}
