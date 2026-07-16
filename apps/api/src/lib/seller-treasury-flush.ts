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

const MOCK_BALANCE_HOLDER = '0x0000000000000000000000000000000000000001' as Address;

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

/** Injectable transfer surface so unit tests never hit real RPC. */
export type TreasuryTransferClients = {
  readBalance: (token: Address, account: Address) => Promise<bigint>;
  transfer: (input: { token: Address; to: Address; amount: bigint }) => Promise<Hex>;
  waitForReceipt: (hash: Hex) => Promise<void>;
};

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

function createLiveTransferClients(
  env: NodeJS.ProcessEnv,
  rpcUrl: string,
  treasuryKey: Hex
): { clients: TreasuryTransferClients; treasuryAddress: Address } {
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

  return {
    treasuryAddress: account.address,
    clients: {
      async readBalance(token, holder) {
        return (await publicClient.readContract({
          address: token,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'balanceOf',
          args: [holder],
        })) as bigint;
      },
      async transfer({ token, to, amount }) {
        return walletClient.writeContract({
          address: token,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [to, amount],
          account,
          chain,
        });
      },
      async waitForReceipt(hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      },
    },
  };
}

/**
 * Transfer accrued seller USDG from platform treasury to the seller payout wallet,
 * then mark ledger rows settled. Claim-before-transfer prevents concurrent double-pay.
 * If no treasury key/RPC, returns not_configured unless allowLedgerOnly is true
 * (explicit dry ledger mark — non-production / ops only).
 */
export async function flushSellerTreasuryPayout(input: {
  ctx: ApiContext;
  providerIds: string[];
  sellerPayoutWallet: string;
  allowLedgerOnly?: boolean;
  /** Non-production only: mark ledger settled without on-chain transfer. */
  txHashOverride?: string;
  /** Test injection — do not hit real RPC. */
  transferClients?: TreasuryTransferClients;
  /** Override NODE_ENV production check for tests. */
  nodeEnv?: string;
}): Promise<TreasuryFlushResult> {
  const env = input.ctx.env;
  const nodeEnv = input.nodeEnv ?? env.NODE_ENV ?? process.env.NODE_ENV;
  const isProduction = nodeEnv === 'production';
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

  // Production: never mark settled from unverified client txHash.
  if (input.txHashOverride && isProduction) {
    return {
      ok: false,
      error: 'tx_hash_not_allowed',
      message:
        'Client-supplied txHash is not accepted in production. Use treasury-backed flush or ops recovery.',
      flushMinUsd,
      pendingUsd: stats.pendingUsd,
    };
  }

  // Claim specific rows before any transfer so concurrent flushes cannot double-pay.
  const claim = input.ctx.controlState.claimSellerPayoutsForFlush(input.providerIds, {
    minUsd: flushMinUsd,
  });
  if (claim.payoutIds.length === 0 || claim.claimedUsd < flushMinUsd) {
    return {
      ok: false,
      error: 'flush_not_eligible',
      message: `Accrued balance $${claim.claimedUsd.toFixed(4)} is below the flush floor of $${flushMinUsd.toFixed(2)} USDG.`,
      flushMinUsd,
      pendingUsd: claim.claimedUsd,
    };
  }

  const claimRef = { claimId: claim.claimId, payoutIds: claim.payoutIds };

  const settleClaim = (txHash?: string): Extract<TreasuryFlushResult, { ok: true }> => {
    const marked = input.ctx.controlState.settleSellerPayoutClaim(claimRef, { txHash });
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
      ...(txHash ? { txHash } : {}),
    };
  };

  const releaseClaim = () => {
    input.ctx.controlState.releaseSellerPayoutClaim(claimRef);
  };

  // Explicit tx from client (non-production / tests) — claim then ledger mark only.
  if (input.txHashOverride) {
    return settleClaim(input.txHashOverride);
  }

  const rpcUrl = resolveRpcUrl(env);
  const treasuryKey = resolveTreasuryPrivateKey(env);
  const token = resolveTokenAddress(env);
  const amountAtomic = usdToAtomicUsdg(claim.claimedUsd, ROBINHOOD_USDG_DECIMALS);

  if (!input.transferClients && (!rpcUrl || !treasuryKey)) {
    if (input.allowLedgerOnly) {
      return settleClaim();
    }
    releaseClaim();
    return {
      ok: false,
      error: 'treasury_not_configured',
      message:
        'Configure BOSSRAID_RPC_URL and BOSSRAID_SETTLEMENT_TREASURY_KEY (or BOSSRAID_CLIENT_PRIVATE_KEY) for automatic USDG flush.',
      flushMinUsd,
      pendingUsd: claim.claimedUsd,
    };
  }

  try {
    let clients: TreasuryTransferClients;
    let balanceHolder: Address;

    if (input.transferClients) {
      clients = input.transferClients;
      balanceHolder = MOCK_BALANCE_HOLDER;
    } else {
      if (!rpcUrl || !treasuryKey) {
        releaseClaim();
        return {
          ok: false,
          error: 'treasury_not_configured',
          message:
            'Configure BOSSRAID_RPC_URL and BOSSRAID_SETTLEMENT_TREASURY_KEY (or BOSSRAID_CLIENT_PRIVATE_KEY) for automatic USDG flush.',
          flushMinUsd,
          pendingUsd: claim.claimedUsd,
        };
      }
      const live = createLiveTransferClients(env, rpcUrl, treasuryKey);
      clients = live.clients;
      balanceHolder = live.treasuryAddress;
    }

    const treasuryBalance = await clients.readBalance(token, balanceHolder);
    if (treasuryBalance < amountAtomic) {
      releaseClaim();
      return {
        ok: false,
        error: 'insufficient_treasury_balance',
        message: `Treasury USDG balance ${treasuryBalance.toString()} atomic is below required ${amountAtomic.toString()}.`,
        flushMinUsd,
        pendingUsd: claim.claimedUsd,
      };
    }

    const txHash = await clients.transfer({
      token,
      to,
      amount: amountAtomic,
    });
    await clients.waitForReceipt(txHash);

    const settled = settleClaim(txHash);
    return {
      ...settled,
      mode: 'onchain',
      txHash,
    };
  } catch (error) {
    releaseClaim();
    const message = error instanceof Error ? error.message : 'Treasury transfer failed.';
    return {
      ok: false,
      error: 'treasury_transfer_failed',
      message,
      flushMinUsd,
      pendingUsd: claim.claimedUsd,
    };
  }
}
