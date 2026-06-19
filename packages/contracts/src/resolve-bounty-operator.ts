import { getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

function normalizePrivateKey(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

export function resolveBountyOperatorAddress(options: {
  deployerAddress: Address;
  operatorAddress?: string;
  clientPrivateKey?: string;
}): Address {
  if (options.operatorAddress?.trim()) {
    return getAddress(options.operatorAddress.trim());
  }

  if (options.clientPrivateKey?.trim()) {
    return privateKeyToAccount(normalizePrivateKey(options.clientPrivateKey.trim())).address;
  }

  return options.deployerAddress;
}
