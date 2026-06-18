import { x402Client, x402HTTPClient } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { ExactEvmSchemeV1 } from '@x402/evm/v1';
import { encodeBase64Json } from './http-e2e.mjs';

export function createX402WalletClient(account) {
  return x402Client.fromConfig({
    schemes: [
      ...['base-sepolia', 'base', 'sepolia', 'ethereum'].map((network) => ({
        x402Version: 1,
        network,
        client: new ExactEvmSchemeV1(account),
      })),
      { network: 'eip155:*', client: new ExactEvmScheme(account) },
    ],
  });
}

export async function runMockPayment({ url, payload, headers = {}, payer }) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
      'payment-signature': encodeBase64Json({
        proof: 'facilitator-signed-payment',
        payer,
      }),
    },
    body: JSON.stringify(payload),
  });
}

export async function runWalletPayment({ url, payload, paymentRequired, headers = {}, account }) {
  const client = createX402WalletClient(account);
  const httpClient = new x402HTTPClient(client);
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
      ...httpClient.encodePaymentSignatureHeader(paymentPayload),
    },
    body: JSON.stringify(payload),
  });
}