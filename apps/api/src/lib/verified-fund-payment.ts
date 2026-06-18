import { type ApiContext } from '../api-context.js';
import { readBooleanEnv } from './env.js';
import { readX402ConfigForContext } from './x402-runtime.js';
import {
  applyX402Headers,
  buildPaymentRequiredForRoute,
  requireX402Payment,
  type X402PaymentRequired,
  type X402RouteName,
  type X402SettlementResponse,
} from '../x402.js';

type RawHeaders = Record<string, string | string[] | undefined>;

export type VerifiedFundPaymentResult = {
  paidAmountUsd: number;
  escrowFundingUsd: number;
  platformMarkupUsd: number;
  settlement?: X402SettlementResponse;
  paymentRequired?: X402PaymentRequired;
};

export function allowUnverifiedFundInDev(
  env: NodeJS.ProcessEnv,
  envKey: 'BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND' | 'BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND'
): boolean {
  return env.NODE_ENV !== 'production' && readBooleanEnv(env[envKey]);
}

export async function collectVerifiedFundPayment(input: {
  ctx: ApiContext;
  route: X402RouteName;
  budgetUsd: number;
  headers: RawHeaders;
  paymentRequiredExtra?: Record<string, unknown>;
}): Promise<VerifiedFundPaymentResult> {
  const x402Config = readX402ConfigForContext(input.ctx);
  const paymentRequired = buildPaymentRequiredForRoute(
    x402Config,
    input.route,
    input.budgetUsd,
    input.paymentRequiredExtra ? { extra: input.paymentRequiredExtra } : undefined
  );
  const payment = await requireX402Payment({
    route: input.route,
    headers: input.headers,
    config: x402Config,
    budgetUsd: input.budgetUsd,
    paymentRequired,
  });
  return {
    paidAmountUsd: payment.paidAmountUsd,
    escrowFundingUsd: payment.escrowFundingUsd,
    platformMarkupUsd: payment.platformMarkupUsd,
    settlement: payment.settlement,
    paymentRequired,
  };
}

export function applyVerifiedFundSettlementHeaders(
  reply: { header: (name: string, value: string) => void },
  settlement?: X402SettlementResponse
): void {
  applyX402Headers(reply as never, { settlement });
}
