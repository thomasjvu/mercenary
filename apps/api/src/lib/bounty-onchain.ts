import type { BountyRecord } from '@bossraid/shared-types';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  maxUint256,
  parseEventLogs,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { BOUNTY_ESCROW_ABI, ERC20_MINIMAL_ABI } from '@bossraid/raid-core';
import { resolveApiSettlementMode } from './settlement-mode.js';

/** USDG and USDC both use 6 decimals; name kept for test compatibility. */
export const USDC_ATOMIC_MULTIPLIER = 1_000_000n;
export const USDG_ATOMIC_MULTIPLIER = USDC_ATOMIC_MULTIPLIER;

export const erc20MinimalAbi = ERC20_MINIMAL_ABI;

export const bountyEscrowAbi = BOUNTY_ESCROW_ABI;

export type BountyOnchainConfig = {
  rpcUrl: string;
  chainId: string;
  bountyEscrowAddress: Address;
  tokenAddress: Address;
  operatorPrivateKey: Hex;
};

export class BountyOnchainError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'BountyOnchainError';
  }
}

export function isBountyOnchainConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = resolveApiSettlementMode(env);
  if (mode !== 'onchain') {
    return false;
  }

  return Boolean(
    env.BOSSRAID_RPC_URL &&
    env.BOSSRAID_CHAIN_ID &&
    env.BOSSRAID_BOUNTY_ESCROW_ADDRESS &&
    env.BOSSRAID_TOKEN_ADDRESS &&
    env.BOSSRAID_CLIENT_PRIVATE_KEY
  );
}

export function requiresProductionBountyEscrow(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' && resolveApiSettlementMode(env) === 'onchain';
}

export function readBountyOnchainConfig(env: NodeJS.ProcessEnv = process.env): BountyOnchainConfig {
  const rpcUrl = env.BOSSRAID_RPC_URL;
  const chainId = env.BOSSRAID_CHAIN_ID;
  const bountyEscrowAddress = env.BOSSRAID_BOUNTY_ESCROW_ADDRESS;
  const tokenAddress = env.BOSSRAID_TOKEN_ADDRESS;
  const operatorPrivateKey = env.BOSSRAID_CLIENT_PRIVATE_KEY;

  if (!rpcUrl || !chainId || !bountyEscrowAddress || !tokenAddress || !operatorPrivateKey) {
    throw new Error('Bounty onchain settlement is not fully configured.');
  }

  return {
    rpcUrl,
    chainId,
    bountyEscrowAddress: getAddress(bountyEscrowAddress),
    tokenAddress: getAddress(tokenAddress),
    operatorPrivateKey: normalizePrivateKey(operatorPrivateKey),
  };
}

export class BountyOnchainExecutor {
  private readonly publicClient;
  private readonly operatorClient;
  private readonly operatorAccount;
  private readonly chain;

  constructor(private readonly config: BountyOnchainConfig) {
    this.chain = defineChain({
      id: Number(config.chainId),
      name: 'bossraid',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
    this.operatorAccount = privateKeyToAccount(config.operatorPrivateKey);
    this.operatorClient = createWalletClient({
      account: this.operatorAccount,
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
  }

  get operatorAddress(): Address {
    return this.operatorAccount.address;
  }

  async preflightFundBounty(bounty: BountyRecord): Promise<void> {
    const deadlines = deadlineUnix(bounty);
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    if (deadlines.bidding <= nowSec) {
      throw new BountyOnchainError('Bidding deadline must be in the future.', 'deadline_passed');
    }

    const required = usdToAtomic(bounty.rewardAmountUsd);
    const balance = await this.publicClient.readContract({
      address: this.config.tokenAddress,
      abi: erc20MinimalAbi,
      functionName: 'balanceOf',
      args: [this.operatorAccount.address],
    });
    if (balance < required) {
      throw new BountyOnchainError(
        'Operator wallet does not hold enough USDG to fund bounty escrow.',
        'insufficient_operator_balance'
      );
    }
  }

  async ensureTokenAllowance(requiredAmount: bigint): Promise<void> {
    const allowance = await this.publicClient.readContract({
      address: this.config.tokenAddress,
      abi: erc20MinimalAbi,
      functionName: 'allowance',
      args: [this.operatorAccount.address, this.config.bountyEscrowAddress],
    });
    if (allowance >= requiredAmount) {
      return;
    }

    const approveHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.tokenAddress,
      abi: erc20MinimalAbi,
      functionName: 'approve',
      args: [this.config.bountyEscrowAddress, maxUint256],
      account: this.operatorAccount,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  async createAndFundBounty(input: {
    posterWallet: string;
    bounty: BountyRecord;
  }): Promise<{ onchainBountyId: string; fundTxHash: Hash }> {
    await this.preflightFundBounty(input.bounty);
    const totalBudget = usdToAtomic(input.bounty.rewardAmountUsd);
    await this.ensureTokenAllowance(totalBudget);

    const poster = getAddress(input.posterWallet);
    const deadlines = deadlineUnix(input.bounty);

    const createHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'createBountyOnBehalf',
      args: [
        poster,
        totalBudget,
        deadlines.bidding,
        deadlines.award,
        deadlines.delivery,
        deadlines.accept,
        `bossraid:${input.bounty.id}`,
      ],
      account: this.operatorAccount,
    });
    const createReceipt = await this.publicClient.waitForTransactionReceipt({ hash: createHash });
    const onchainBountyId = extractUintEventArg(
      parseEventLogs({
        abi: bountyEscrowAbi,
        logs: createReceipt.logs,
        eventName: 'BountyCreated',
      }),
      'bountyId',
      'BountyCreated'
    );

    const fundHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'fundBountyOnBehalf',
      args: [onchainBountyId],
      account: this.operatorAccount,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: fundHash });

    return {
      onchainBountyId: onchainBountyId.toString(),
      fundTxHash: fundHash,
    };
  }

  async createAward(input: {
    onchainBountyId: string;
    providerAddress: Address;
    amountUsd: number;
  }): Promise<{ onchainAwardId: string; txHash: Hash }> {
    const txHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'createAwardOnBehalf',
      args: [BigInt(input.onchainBountyId), input.providerAddress, usdToAtomic(input.amountUsd)],
      account: this.operatorAccount,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const onchainAwardId = extractUintEventArg(
      parseEventLogs({
        abi: bountyEscrowAbi,
        logs: receipt.logs,
        eventName: 'AwardCreated',
      }),
      'awardId',
      'AwardCreated'
    );
    return { onchainAwardId: onchainAwardId.toString(), txHash };
  }

  async submitDelivery(input: { onchainAwardId: string; deliveryHashHex: string }): Promise<Hash> {
    const txHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'submitDeliveryOnBehalf',
      args: [BigInt(input.onchainAwardId), hexToBytes32(input.deliveryHashHex)],
      account: this.operatorAccount,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async acceptAward(onchainAwardId: string): Promise<Hash> {
    const txHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'acceptAwardOnBehalf',
      args: [BigInt(onchainAwardId)],
      account: this.operatorAccount,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async claimPayout(onchainAwardId: string): Promise<Hash> {
    const txHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'claimPayout',
      args: [BigInt(onchainAwardId)],
      account: this.operatorAccount,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async refundUnawarded(onchainBountyId: string): Promise<Hash> {
    const txHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'refundUnawarded',
      args: [BigInt(onchainBountyId)],
      account: this.operatorAccount,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async forfeitAward(onchainAwardId: string): Promise<Hash> {
    const txHash = await this.operatorClient.writeContract({
      chain: this.chain,
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'forfeitAward',
      args: [BigInt(onchainAwardId)],
      account: this.operatorAccount,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async readTokenBalance(address: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.config.tokenAddress,
      abi: erc20MinimalAbi,
      functionName: 'balanceOf',
      args: [address],
    });
  }

  async readAwardStatus(onchainAwardId: string): Promise<number> {
    const award = await this.publicClient.readContract({
      address: this.config.bountyEscrowAddress,
      abi: bountyEscrowAbi,
      functionName: 'awards',
      args: [BigInt(onchainAwardId)],
    });
    // Award: bountyId, provider, amount, deliveryHash, status, deliveredAt
    return Number(award[4]);
  }
}

export function createBountyOnchainExecutor(
  env: NodeJS.ProcessEnv = process.env
): BountyOnchainExecutor | null {
  if (!isBountyOnchainConfigured(env)) {
    return null;
  }

  return new BountyOnchainExecutor(readBountyOnchainConfig(env));
}

export function parseProviderAddressMap(
  env: NodeJS.ProcessEnv = process.env
): Record<string, Address> {
  const raw = env.BOSSRAID_PROVIDER_ADDRESS_MAP_JSON;
  if (!raw?.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(parsed).map(([providerId, address]) => [providerId, getAddress(address)])
  );
}

export function resolveProviderAddress(
  providerId: string,
  map: Record<string, Address>
): Address | null {
  return map[providerId] ?? null;
}

export function usdToAtomic(amountUsd: number): bigint {
  return BigInt(Math.max(1, Math.round(amountUsd * Number(USDC_ATOMIC_MULTIPLIER))));
}

export function deadlineUnix(bounty: BountyRecord): {
  bidding: bigint;
  award: bigint;
  delivery: bigint;
  accept: bigint;
} {
  return {
    bidding: BigInt(Math.floor(Date.parse(bounty.deadlines.biddingDeadlineAt) / 1000)),
    award: BigInt(Math.floor(Date.parse(bounty.deadlines.awardDeadlineAt) / 1000)),
    delivery: BigInt(Math.floor(Date.parse(bounty.deadlines.deliveryDeadlineAt) / 1000)),
    accept: BigInt(Math.floor(Date.parse(bounty.deadlines.acceptDeadlineAt) / 1000)),
  };
}

export function hexToBytes32(hex: string): Hex {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  return `0x${normalized.padStart(64, '0')}` as Hex;
}

function normalizePrivateKey(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

function extractUintEventArg(
  events: Array<{ args?: Record<string, unknown> }>,
  field: 'bountyId' | 'awardId',
  eventName: string
): bigint {
  const value = events[0]?.args?.[field];
  if (typeof value !== 'bigint') {
    throw new Error(`Missing ${field} in ${eventName} event.`);
  }

  return value;
}

export function mapBountyOnchainError(error: unknown): BountyOnchainError {
  if (error instanceof BountyOnchainError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new BountyOnchainError(message, 'onchain_execution_failed');
}
