import { type FastifyInstance } from 'fastify';
import { isUpstreamProviderId } from '@bossraid/constants';
import { type ApiContext } from '../api-context.js';

export function registerInferenceReceiptRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get('/v1/inference/receipts/:receiptId', async (request, reply) => {
    const receiptId = (request.params as { receiptId: string }).receiptId;
    const receipt = ctx.inferenceReceiptStore.get(receiptId);
    if (!receipt) {
      reply.code(404);
      return { error: 'not_found', message: `Unknown inference receipt: ${receiptId}` };
    }
    return receipt;
  });

  app.get('/v1/inference/receipts/:receiptId/verify', async (request, reply) => {
    const receiptId = (request.params as { receiptId: string }).receiptId;
    const receipt = ctx.inferenceReceiptStore.get(receiptId);
    if (!receipt) {
      reply.code(404);
      return { error: 'not_found', message: `Unknown inference receipt: ${receiptId}` };
    }

    const vendor = receipt.tee.upstreamVendor ?? receipt.tee.vendor;
    if (!vendor || !isUpstreamProviderId(vendor)) {
      reply.code(400);
      return { error: 'unsupported_vendor', message: `Unsupported TEE vendor: ${vendor}` };
    }

    const checks = receipt.tee.checks ?? [];
    return {
      receiptId: receipt.receiptId,
      valid: receipt.verificationStatus === 'verified' || receipt.verificationStatus === 'mock',
      verificationStatus: receipt.verificationStatus,
      modelId: receipt.modelId,
      providerId: receipt.providerId,
      inputHash: receipt.inputHash,
      outputHash: receipt.outputHash,
      explorerUrl: receipt.explorerUrl,
      checks,
      tee: receipt.tee,
    };
  });
}
