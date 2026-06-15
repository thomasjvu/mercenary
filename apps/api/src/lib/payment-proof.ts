import { asSingleHeader } from '@bossraid/shared-types';
import type {
  DelegationChainEntry,
  RaidPaymentProof,
  X402AssetTransferMethod,
} from '@bossraid/shared-types';
import type { FastifyRequest } from 'fastify';
import { decodeHeaderValue } from '../x402-verify.js';
import type { LaunchPaymentContext } from '../handlers/payment.js';
import type { X402Config } from '../x402-config.js';

type RawHeaders = Record<string, string | string[] | undefined>;

function readDelegationChain(headers: RawHeaders): DelegationChainEntry[] | undefined {
  const header = asSingleHeader(headers['x-bossraid-delegation-chain']);
  if (!header) {
    return undefined;
  }

  try {
    const decoded = decodeHeaderValue<DelegationChainEntry[]>(
      header,
      'X-BossRaid-Delegation-Chain'
    );
    return Array.isArray(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function buildRaidPaymentProof(input: {
  launchPayment: LaunchPaymentContext;
  config: X402Config;
  request: FastifyRequest;
}): RaidPaymentProof | undefined {
  const settlement = input.launchPayment.settlement;
  if (!settlement?.success) {
    return undefined;
  }

  const delegationChain = readDelegationChain(input.request.headers);
  const oneshotTaskId = asSingleHeader(input.request.headers['x-bossraid-oneshot-task-id']);

  const chain: DelegationChainEntry[] = [
    ...(delegationChain ?? []),
    {
      type: 'x402_settlement',
      at: new Date().toISOString(),
      summary: `Settled ${input.config.assetTransferMethod} payment via ${input.config.facilitatorUrl ?? 'facilitator'}.`,
      data: {
        transaction: settlement.transaction,
        payer: settlement.payer,
        network: settlement.network,
      },
    },
  ];

  if (oneshotTaskId) {
    chain.push({
      type: 'oneshot_relay',
      at: new Date().toISOString(),
      summary: '1Shot relayer task submitted for gas-abstracted execution.',
      data: { taskId: oneshotTaskId },
    });
  }

  return {
    method: input.config.assetTransferMethod as X402AssetTransferMethod,
    payer: settlement.payer,
    transaction: settlement.transaction,
    facilitatorUrl: input.config.facilitatorUrl,
    paidAmountUsd: input.launchPayment.escrowFundingUsd,
    delegationChain: chain,
    oneshotTaskId,
  };
}
