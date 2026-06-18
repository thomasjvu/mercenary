import { type FastifyReply } from 'fastify';
import { applyX402Headers, X402ProtocolError } from '../x402.js';

export function sendX402Required(reply: FastifyReply, error: X402ProtocolError): void {
  const reservationId = error.paymentRequired.accepts[0]?.extra?.reservationId;
  if (typeof reservationId === 'string') {
    reply.header('X-BOSSRAID-LAUNCH-RESERVATION', reservationId);
  }
  applyX402Headers(reply, {
    paymentRequired: error.paymentRequired,
    settlement: error.settlement,
  });
  reply.code(error.statusCode).send({
    error: 'payment_required',
    message: error.message,
    x402: error.paymentRequired,
    settlement: error.settlement,
  });
}
