import { asSingleHeader } from '@bossraid/shared-types';
import {
  type X402Config,
  type X402PaymentRequired,
  type X402SettlementResponse,
  type X402VerificationResponse,
} from './x402-config.js';
import {
  DEFAULT_CDP_FACILITATOR_URL,
  facilitatorRequest,
  isPayAIFacilitator,
} from './x402-facilitator.js';

type RawHeaders = Record<string, string | string[] | undefined>;

export function encodeHeaderValue(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function decodeHeaderValue<T>(value: string | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing ${label} header.`);
  }

  try {
    const json = Buffer.from(value, 'base64').toString('utf8');
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(
      `${label} header did not contain valid base64 JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function verifyPayment(
  config: X402Config,
  signatureHeader: string | undefined,
  paymentRequired: X402PaymentRequired
): Promise<X402VerificationResponse> {
  if (!config.facilitatorUrl) {
    throw new Error('x402 payment verification requires a configured facilitator.');
  }

  const paymentPayload = decodeHeaderValue<unknown>(signatureHeader, 'PAYMENT-SIGNATURE');
  return facilitatorRequest<X402VerificationResponse>(config, '/verify', {
    x402Version: 1,
    paymentPayload,
    paymentRequirements: paymentRequired.accepts[0],
  });
}

export function isVerificationSuccessful(verification: X402VerificationResponse): boolean {
  return (
    verification.isValid === true || verification.valid === true || verification.success === true
  );
}

export async function refundPayment(
  config: X402Config,
  signatureHeader: string | undefined,
  paymentRequired: X402PaymentRequired,
  reason: string
): Promise<X402SettlementResponse> {
  if (!config.facilitatorUrl) {
    throw new Error('x402 payment refund requires a configured facilitator.');
  }

  const paymentPayload = decodeHeaderValue<unknown>(signatureHeader, 'PAYMENT-SIGNATURE');
  return facilitatorRequest<X402SettlementResponse>(config, '/refund', {
    x402Version: 1,
    paymentPayload,
    paymentRequirements: paymentRequired.accepts[0],
    reason,
  });
}

export async function settlePayment(
  config: X402Config,
  signatureHeader: string | undefined,
  paymentRequired: X402PaymentRequired
): Promise<X402SettlementResponse> {
  if (!config.facilitatorUrl) {
    throw new Error('x402 payment settlement requires a configured facilitator.');
  }

  const paymentPayload = decodeHeaderValue<unknown>(signatureHeader, 'PAYMENT-SIGNATURE');
  const settleRequest = {
    x402Version: 1 as const,
    paymentPayload,
    paymentRequirements: paymentRequired.accepts[0],
  };

  try {
    return await facilitatorRequest<X402SettlementResponse>(config, '/settle', settleRequest);
  } catch (payaiError) {
    if (
      config.facilitatorFallback &&
      isPayAIFacilitator(config) &&
      config.cdpApiKeyId &&
      config.cdpApiKeySecret
    ) {
      const cdpConfig: X402Config = {
        ...config,
        facilitatorUrl: DEFAULT_CDP_FACILITATOR_URL,
      };
      return facilitatorRequest<X402SettlementResponse>(cdpConfig, '/settle', settleRequest);
    }

    throw payaiError;
  }
}

export function applyX402Headers(
  reply: { header(name: string, value: string): unknown },
  input: {
    paymentRequired?: X402PaymentRequired;
    settlement?: X402SettlementResponse;
  }
): void {
  if (input.paymentRequired) {
    reply.header('PAYMENT-REQUIRED', encodeHeaderValue(input.paymentRequired));
  }
  if (input.settlement) {
    reply.header('PAYMENT-RESPONSE', encodeHeaderValue(input.settlement));
  }
}

export function readX402ReservationId(
  headers: RawHeaders,
  headerName = 'x-bossraid-launch-reservation'
): string | undefined {
  const explicitHeader = asSingleHeader(headers[headerName]);
  if (explicitHeader) {
    return explicitHeader;
  }

  const signatureHeader = asSingleHeader(headers['payment-signature']);
  if (!signatureHeader) {
    return undefined;
  }

  try {
    const payload = decodeHeaderValue<{
      requirement?: {
        extra?: Record<string, unknown>;
      };
    }>(signatureHeader, 'PAYMENT-SIGNATURE');
    const reservationId = payload.requirement?.extra?.reservationId;
    return typeof reservationId === 'string' ? reservationId : undefined;
  } catch {
    return undefined;
  }
}
