import { ROBINHOOD_CHAIN_ID } from '@bossraid/constants';
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';
import { createWalletClient, custom, defineChain } from 'viem';
import { ROBINHOOD_CHAIN_ID_NUM } from './config.js';

export type SmartAccountWalletClient = ReturnType<typeof createSmartAccountWalletClient>;

function robinhoodChain() {
  const rpc =
    (typeof process !== 'undefined' &&
      (process.env.BOSSRAID_ROBINHOOD_RPC_URL || process.env.BOSSRAID_RPC_URL)?.trim()) ||
    'https://rpc.robinhood.xyz';
  return defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: 'Robinhood',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
}

export function createSmartAccountWalletClient(
  ethereum: unknown,
  chainId = ROBINHOOD_CHAIN_ID_NUM
) {
  const chain = resolveChain(chainId);
  return createWalletClient({
    chain,
    transport: custom(ethereum as Parameters<typeof custom>[0]),
  }).extend(erc7715ProviderActions());
}

export function resolveChain(chainId = ROBINHOOD_CHAIN_ID_NUM) {
  void chainId;
  return robinhoodChain();
}
