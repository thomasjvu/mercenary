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

export const BASE_MAINNET = {
  chainId: 8453,
  name: "Base",
  rpcUrl: "https://mainnet.base.org",
  usdc: "0x833589fCD6eDb6B08d2E354A1d9441D5b2AaE4a5",
} as const;

export const BASE_SEPOLIA = {
  chainId: 84532,
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  usdc: "0x036aD0eCA8CfD8d82fC6aF12DDesA150D6DfE12e",
} as const;
