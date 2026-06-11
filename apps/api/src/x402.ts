import { asSingleHeader } from '@bossraid/shared-types';
import {
  buildPaymentRequiredForRoute,
  buildX402PaymentRequired,
  computeChargeUsd,
  readX402Config,
  type X402Config,
  type X402PaymentRequired,
  type X402PaymentRequirement,
  type X402RouteName,
  type X402SettlementResponse,
  type X402VerificationResponse,
} from './x402-config.js';
import { isVerificationSuccessful, settlePayment, verifyPayment } from './x402-verify.js';

export type {
  X402PaymentRequirement,
  X402PaymentRequired,
  X402SettlementResponse,
  X402VerificationResponse,
};

export { applyX402Headers, readX402ReservationId } from './x402-verify.js';
export { buildPaymentRequiredForRoute, buildX402PaymentRequired, readX402Config };

class X402ProtocolError extends Error {
  readonly statusCode: number;
  readonly paymentRequired: X402PaymentRequired;
  readonly settlement?: X402SettlementResponse;

  constructor(
    message: string,
    paymentRequired: X402PaymentRequired,
    statusCode = 402,
    settlement?: X402SettlementResponse
  ) {
    super(message);
    this.name = 'X402ProtocolError';
    this.statusCode = statusCode;
    this.paymentRequired = paymentRequired;
    this.settlement = settlement;
  }
}

type RawHeaders = Record<string, string | string[] | undefined>;

export async function requireX402Payment(input: {
  route: X402RouteName;
  headers: RawHeaders;
  env?: NodeJS.ProcessEnv;
  config?: X402Config;
  budgetUsd?: number;
  paymentRequired?: X402PaymentRequired;
}): Promise<{
  settlement?: X402SettlementResponse;
  paymentRequired?: X402PaymentRequired;
  paidAmountUsd: number;
  escrowFundingUsd: number;
  platformMarkupUsd: number;
}> {
  const config = input.config ?? readX402Config(input.env);
  if (!config.enabled) {
    return {
      paidAmountUsd: 0,
      escrowFundingUsd: 0,
      platformMarkupUsd: 0,
    };
  }

  const computed = computeChargeUsd(config, input.route, input.budgetUsd ?? 0);
  const paymentRequired =
    input.paymentRequired ??
    buildPaymentRequiredForRoute(config, input.route, input.budgetUsd ?? 0);
  const signatureHeader = asSingleHeader(input.headers['payment-signature']);
  if (!signatureHeader) {
    throw new X402ProtocolError('Payment required.', paymentRequired);
  }

  const verification = await verifyPayment(config, signatureHeader, paymentRequired);
  if (!isVerificationSuccessful(verification)) {
    throw new X402ProtocolError(verification.error ?? 'Payment verification failed.', {
      ...paymentRequired,
      error: verification.error ?? 'payment_verification_failed',
    });
  }

  const settlement = await settlePayment(config, signatureHeader, paymentRequired);
  if (!settlement.success) {
    throw new X402ProtocolError(
      settlement.error ?? 'Payment settlement failed.',
      {
        ...paymentRequired,
        error: settlement.error ?? 'payment_settlement_failed',
      },
      402,
      settlement
    );
  }

  return {
    settlement,
    paymentRequired,
    paidAmountUsd: computed.totalUsd,
    escrowFundingUsd: computed.budgetUsd,
    platformMarkupUsd: computed.markupUsd,
  };
}

export function isX402ProtocolError(error: unknown): error is X402ProtocolError {
  return error instanceof X402ProtocolError;
}
