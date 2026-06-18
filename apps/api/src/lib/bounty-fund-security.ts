import { readBooleanEnv } from './env.js';
import { isBountyOnchainConfigured, requiresProductionBountyEscrow } from './bounty-onchain.js';
import type { BountyFundBody } from './bounty-fund.js';

export function rejectClientSuppliedEscrowProof(input: {
  env: NodeJS.ProcessEnv;
  x402Enabled: boolean;
  fundBody: BountyFundBody;
}): { ok: true } | { ok: false; statusCode: number; body: Record<string, unknown> } {
  const isProduction = input.env.NODE_ENV === 'production';
  const onchainRequired =
    requiresProductionBountyEscrow(input.env) || isBountyOnchainConfigured(input.env);
  const mustUseServerProof =
    isProduction ||
    input.x402Enabled ||
    onchainRequired ||
    readBooleanEnv(input.env.BOSSRAID_X402_ENABLED);

  if (!mustUseServerProof) {
    return { ok: true };
  }

  if (input.fundBody.escrowJobId || input.fundBody.escrowReceiptJson) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: 'client_escrow_proof_rejected',
        message:
          'escrowJobId and escrowReceiptJson are assigned by the server after verified payment. Do not send them in the request body.',
      },
    };
  }

  return { ok: true };
}
