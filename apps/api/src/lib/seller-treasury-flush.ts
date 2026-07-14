import {
  ROBINHOOD_CHAIN_CAIP2,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_USDG_ADDRESS,
  ROBINHOOD_USDG_DECIMALS,
  readSettlementMinPayoutUsd,
} from '@bossraid/constants';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { ApiContext } from '../api-context.js';
import { usdToAtomicUsdg } from './x402-settle-verify.js';

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

function resolveTreasuryPrivateKey(env: NodeJS.ProcessEnv): Hex | undefined {
  const raw =
    env.BOSSRAID_SETTLEMENT_TREASURY_KEY?.trim() ||
    env.BOSSRAID_CLIENT_PRIVATE_KEY?.trim() ||
    undefined;
  if (!raw) {
    return undefined;
  }
  return (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
}

function resolveRpcUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.BOSSRAID_RPC_URL?.trim() || env.BOSSRAID_ROBINHOOD_RPC_URL?.trim() || undefined;
}

function resolveTokenAddress(env: NodeJS.ProcessEnv): Address {
  const raw = env.BOSSRAID_TOKEN_ADDRESS?.trim() || ROBINHOOD_USDG_ADDRESS;
  return getAddress(raw);
}

function resolveChainId(env: NodeJS.ProcessEnv): number {
  if (env.BOSSRAID_CHAIN_ID?.trim()) {
    return Number(env.BOSSRAID_CHAIN_ID);
  }
  return ROBINHOOD_CHAIN_ID;
}

export type TreasuryFlushResult =
  | {
      ok: true;
      mode: 'onchain' | 'ledger_only';
      flushedCount: number;
      flushedUsd: number;
      payoutIds: string[];
      txHash?: string;
      to: string;
      flushMinUsd: number;
      currency: 'USDG';
      chain: typeof ROBINHOOD_CHAIN_CAIP2;
    }
  | {
      ok: false;
      error: string;
      message: string;
      flushMinUsd: number;
      pendingUsd?: number;
    };

/**
 * Transfer accrued seller USDG from platform treasury to the seller payout wallet,
 * then mark ledger rows settled. If no treasury key/RPC, returns not_configured
 * unless allowLedgerOnly is true (explicit dry ledger mark — ops only).
 */
export async function flushSellerTreasuryPayout(input: {
  ctx: ApiContext;
  providerIds: string[];
  sellerPayoutWallet: string;
  allowLedgerOnly?: boolean;
  txHashOverride?: string;
}): Promise<TreasuryFlushResult> {
  const env = input.ctx.env;
  const flushMinUsd = readSettlementMinPayoutUsd(env);
  const stats = input.ctx.controlState.getSellerStats(input.providerIds, Date.now(), flushMinUsd);

  if (!stats.flushEligible || stats.pendingUsd < flushMinUsd) {
    return {
      ok: false,
      error: 'flush_not_eligible',
      message: `Accrued balance $${stats.pendingUsd.toFixed(4)} is below the flush floor of $${flushMinUsd.toFixed(2)} USDG.`,
      flushMinUsd,
      pendingUsd: stats.pendingUsd,
    };
  }

  let to: Address;
  try {
    to = getAddress(input.sellerPayoutWallet);
  } catch {
    return {
      ok: false,
      error: 'invalid_payout_wallet',
      message: 'Seller payout wallet is not a valid EVM address.',
      flushMinUsd,
      pendingUsd: stats.pendingUsd,
    };
  }

  const rpcUrl = resolveRpcUrl(env);
  const treasuryKey = resolveTreasuryPrivateKey(env);
  const token = resolveTokenAddress(env);
  const amountAtomic = usdToAtomicUsdg(stats.pendingUsd, ROBINHOOD_USDG_DECIMALS);

  // Explicit tx from client (seller already paid off-band) — ledger mark only.
  if (input.txHashOverride) {
    const marked = input.ctx.controlState.flushSellerPayouts(input.providerIds, {
      minUsd: flushMinUsd,
      txHash: input.txHashOverride,
    });
    return {
      ok: true,
      mode: 'ledger_only',
      flushedCount: marked.flushedCount,
      flushedUsd: marked.flushedUsd,
      payoutIds: marked.payoutIds,
      txHash: input.txHashOverride,
      to,
      flushMinUsd,
      currency: 'USDG',
      chain: ROBINHOOD_CHAIN_CAIP2,
    };
  }

  if (!rpcUrl || !treasuryKey) {
    if (input.allowLedgerOnly) {
      const marked = input.ctx.controlState.flushSellerPayouts(input.providerIds, {
        minUsd: flushMinUsd,
      });
      return {
        ok: true,
        mode: 'ledger_only',
        flushedCount: marked.flushedCount,
        flushedUsd: marked.flushedUsd,
        payoutIds: marked.payoutIds,
        to,
        flushMinUsd,
        currency: 'USDG',
        chain: ROBINHOOD_CHAIN_CAIP2,
      };
    }
    return {
      ok: false,
      error: 'treasury_not_configured',
      message:
        'Configure BOSSRAID_RPC_URL and BOSSRAID_SETTLEMENT_TREASURY_KEY (or BOSSRAID_CLIENT_PRIVATE_KEY) for automatic USDG flush.',
      flushMinUsd,
      pendingUsd: stats.pendingUsd,
    };
  }

  const chainId = resolveChainId(env);
  const chain = defineChain({
    id: chainId,
    name: `bossraid-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const account = privateKeyToAccount(treasuryKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const treasuryBalance = (await publicClient.readContract({
    address: token,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint;

  if (treasuryBalance < amountAtomic) {
    return {
      ok: false,
      error: 'insufficient_treasury_balance',
      message: `Treasury USDG balance ${treasuryBalance.toString()} atomic is below required ${amountAtomic.toString()}.`,
      flushMinUsd,
      pendingUsd: stats.pendingUsd,
    };
  }

  const txHash = await walletClient.writeContract({
    address: token,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [to, amountAtomic],
    account,
    chain,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const marked = input.ctx.controlState.flushSellerPayouts(input.providerIds, {
    minUsd: flushMinUsd,
    txHash,
  });

  return {
    ok: true,
    mode: 'onchain',
    flushedCount: marked.flushedCount,
    flushedUsd: marked.flushedUsd,
    payoutIds: marked.payoutIds,
    txHash,
    to,
    flushMinUsd,
    currency: 'USDG',
    chain: ROBINHOOD_CHAIN_CAIP2,
  };
}
