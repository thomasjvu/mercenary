import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';
import { createWalletClient, custom } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } from './config.js';

export type SmartAccountWalletClient = ReturnType<typeof createSmartAccountWalletClient>;

export function createSmartAccountWalletClient(ethereum: unknown, chainId = BASE_CHAIN_ID) {
  const chain = chainId === BASE_SEPOLIA_CHAIN_ID ? baseSepolia : base;
  return createWalletClient({
    chain,
    transport: custom(ethereum as Parameters<typeof custom>[0]),
  }).extend(erc7715ProviderActions());
}

export function resolveChain(chainId = BASE_CHAIN_ID) {
  return chainId === BASE_SEPOLIA_CHAIN_ID ? baseSepolia : base;
}
