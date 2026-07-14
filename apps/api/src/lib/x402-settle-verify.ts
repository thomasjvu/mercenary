import {
  ROBINHOOD_CHAIN_CAIP2,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_USDG_ADDRESS,
  ROBINHOOD_USDG_DECIMALS,
} from '@bossraid/constants';
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  type Hash,
  type Hex,
  type Log,
} from 'viem';
import type { X402Config, X402PaymentRequired, X402SettlementResponse } from '../x402-config.js';

const ERC20_TRANSFER_EVENT = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'value', type: 'uint256', indexed: false },
  ],
} as const;

export type SettleVerifyResult =
  | { ok: true; verifiedAmountAtomic: string; token: string; payTo: string }
  | { ok: false; reason: string };

function resolveRpcUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.BOSSRAID_RPC_URL?.trim() || env.BOSSRAID_ROBINHOOD_RPC_URL?.trim() || undefined;
}

function resolveTokenAddress(config: X402Config): `0x${string}` {
  const asset = config.asset?.trim() ?? '';
  if (asset.startsWith('0x') && asset.length === 42) {
    return getAddress(asset);
  }
  if (asset.toLowerCase() === 'usdg') {
    return getAddress(ROBINHOOD_USDG_ADDRESS);
  }
  throw new Error(`Cannot resolve ERC-20 address for asset ${asset}`);
}

function resolveChainId(config: X402Config, env: NodeJS.ProcessEnv): number {
  if (env.BOSSRAID_CHAIN_ID?.trim()) {
    return Number(env.BOSSRAID_CHAIN_ID);
  }
  if (config.network === ROBINHOOD_CHAIN_CAIP2 || config.network.startsWith('eip155:4663')) {
    return ROBINHOOD_CHAIN_ID;
  }
  const match = /^eip155:(\d+)$/.exec(config.network);
  if (match) {
    return Number(match[1]);
  }
  return ROBINHOOD_CHAIN_ID;
}

function parseTransferToPayTo(logs: Log[], token: `0x${string}`, payTo: `0x${string}`): bigint {
  let total = 0n;
  const tokenLower = token.toLowerCase();
  const payToLower = payTo.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== tokenLower) {
      continue;
    }
    try {
      const decoded = decodeEventLog({
        abi: [ERC20_TRANSFER_EVENT],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') {
        continue;
      }
      const args = decoded.args as { to?: string; value?: bigint };
      if (args.to?.toLowerCase() === payToLower && typeof args.value === 'bigint') {
        total += args.value;
      }
    } catch {
      // not a Transfer log
    }
  }
  return total;
}

/**
 * After facilitator /settle succeeds, optionally re-verify the reported tx on-chain:
 * USDG (or configured asset) Transfer logs must credit payTo with at least maxAmountRequired.
 *
 * When BOSSRAID_RPC_URL is unset, verification is skipped (dev/rehearsal) unless
 * BOSSRAID_X402_REQUIRE_ONCHAIN_VERIFY=1.
 */
export async function verifyX402SettlementOnchain(input: {
  config: X402Config;
  paymentRequired: X402PaymentRequired;
  settlement: X402SettlementResponse;
  env?: NodeJS.ProcessEnv;
}): Promise<SettleVerifyResult> {
  const env = input.env ?? process.env;
  const requireVerify =
    env.BOSSRAID_X402_REQUIRE_ONCHAIN_VERIFY === '1' ||
    env.BOSSRAID_X402_REQUIRE_ONCHAIN_VERIFY === 'true' ||
    env.NODE_ENV === 'production';
  const rpcUrl = resolveRpcUrl(env);

  if (!input.settlement.transaction) {
    return requireVerify
      ? { ok: false, reason: 'Settlement response missing transaction hash.' }
      : {
          ok: true,
          verifiedAmountAtomic: '0',
          token: input.config.asset,
          payTo: input.config.payTo,
        };
  }

  if (!rpcUrl) {
    return requireVerify
      ? {
          ok: false,
          reason: 'BOSSRAID_RPC_URL is required to verify x402 settlements on-chain in production.',
        }
      : {
          ok: true,
          verifiedAmountAtomic: '0',
          token: input.config.asset,
          payTo: input.config.payTo,
        };
  }

  const requirement = input.paymentRequired.accepts[0];
  if (!requirement) {
    return { ok: false, reason: 'Payment requirement missing accepts[0].' };
  }

  let payTo: `0x${string}`;
  let token: `0x${string}`;
  try {
    payTo = getAddress(requirement.payTo || input.config.payTo);
    token = resolveTokenAddress(input.config);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const minAtomic = BigInt(requirement.maxAmountRequired || '0');
  const chainId = resolveChainId(input.config, env);
  const chain = defineChain({
    id: chainId,
    name: `bossraid-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const txHash = input.settlement.transaction as Hash;
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to load settlement receipt ${txHash}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (receipt.status !== 'success') {
    return { ok: false, reason: `Settlement transaction ${txHash} did not succeed.` };
  }

  const transferred = parseTransferToPayTo(receipt.logs, token, payTo);
  if (transferred < minAtomic) {
    return {
      ok: false,
      reason: `On-chain transfer to payTo is ${transferred.toString()} atomic units; required at least ${minAtomic.toString()} (${ROBINHOOD_USDG_DECIMALS} decimals).`,
    };
  }

  return {
    ok: true,
    verifiedAmountAtomic: transferred.toString(),
    token,
    payTo,
  };
}

/** Test helper: decimals for USDG atomic math. */
export function usdToAtomicUsdg(amountUsd: number, decimals = ROBINHOOD_USDG_DECIMALS): bigint {
  const scale = 10 ** decimals;
  return BigInt(Math.max(0, Math.round(amountUsd * scale)));
}

export type { Hex };
