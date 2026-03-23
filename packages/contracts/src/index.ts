export type BossRaidDeployment = {
  chainId?: number;
  rpcUrl: string;
  deployerAddress: string;
  tokenAddress: string;
  registryAddress: string;
  escrowAddress: string;
  transactionHashes: {
    registryDeploy: string;
    escrowDeploy: string;
  };
  deployedAt: string;
};
