export { resolveBountyOperatorAddress } from './resolve-bounty-operator.js';

export type BossRaidDeployment = {
  chainId?: number;
  rpcUrl: string;
  deployerAddress: string;
  bountyOperatorAddress: string;
  tokenAddress: string;
  registryAddress: string;
  escrowAddress: string;
  bountyEscrowAddress: string;
  transactionHashes: {
    registryDeploy: string;
    escrowDeploy: string;
    bountyEscrowDeploy: string;
  };
  deployedAt: string;
};

/** Robinhood Chain + USDG (production settlement rail). */
export const ROBINHOOD_MAINNET = {
  chainId: 4663,
  name: 'Robinhood',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  usdg: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
} as const;
