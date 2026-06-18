import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePaymentResponseHeader } from '@x402/fetch';
import { privateKeyToAccount } from 'viem/accounts';
import { loadLocalEnv } from './env.mjs';
import {
  buildApiUrl,
  decodeBase64Json,
  formatBody,
  normalizeHexPrivateKey,
  parseCliArgs,
  readBody,
  readCliArg,
  resolveApiBase,
} from './lib/http-e2e.mjs';
import { runMockPayment, runWalletPayment } from './lib/x402-e2e-payment.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);

const args = parseCliArgs(process.argv.slice(2));
if (args.has('help')) {
  console.log(
    [
      'Usage:',
      '  pnpm test:x402:e2e -- --mode wallet --route raid',
      '  pnpm test:x402:e2e -- --mode mock --route inference --api-base http://127.0.0.1:8788',
      '',
      'Options:',
      '  --mode wallet|mock',
      '  --route raid|chat|inference',
      '  --api-base <url>',
      '  --payload-file <path>',
    ].join('\n')
  );
  process.exit(0);
}

const route = readCliArg(args, 'route') ?? process.env.BOSSRAID_X402_E2E_ROUTE ?? 'raid';
const mode = readCliArg(args, 'mode') ?? process.env.BOSSRAID_X402_E2E_MODE ?? 'wallet';
const apiBase = resolveApiBase(readCliArg(args, 'api-base'), {
  ...process.env,
  BOSSRAID_X402_E2E_API_BASE: process.env.BOSSRAID_X402_E2E_API_BASE,
});
const payloadFile =
  readCliArg(args, 'payload-file') ?? resolve(rootDir, defaultPayloadForRoute(route));

if (route !== 'raid' && route !== 'chat' && route !== 'inference') {
  throw new Error(`Unsupported --route "${route}". Use "raid", "chat", or "inference".`);
}

if (mode !== 'wallet' && mode !== 'mock') {
  throw new Error(`Unsupported --mode "${mode}". Use "wallet" or "mock".`);
}

if (!existsSync(payloadFile)) {
  throw new Error(`Payload file not found: ${payloadFile}`);
}

const url = buildApiUrl(apiBase, routePathFor(route));
const payload = JSON.parse(readFileSync(payloadFile, 'utf8'));

console.log(
  JSON.stringify(
    {
      step: 'start',
      route,
      mode,
      url,
      payloadFile,
    },
    null,
    2
  )
);

const challengeResponse = await fetchJson(url, payload);
if (challengeResponse.status === 409) {
  throw new Error(
    `Preflight failed before payment. The API reported no eligible providers: ${JSON.stringify(challengeResponse.body)}`
  );
}
if (challengeResponse.status !== 402) {
  throw new Error(
    `Expected 402 challenge from ${url}, got ${challengeResponse.status}: ${JSON.stringify(challengeResponse.body)}`
  );
}

const paymentRequiredHeader = challengeResponse.headers.get('payment-required');
if (!paymentRequiredHeader) {
  throw new Error('Missing PAYMENT-REQUIRED header on 402 response.');
}

const paymentRequired = decodeBase64Json(paymentRequiredHeader);
console.log(
  JSON.stringify(
    {
      step: 'challenge',
      paymentRequired,
    },
    null,
    2
  )
);

const reservationId = readReservationId(challengeResponse.headers, paymentRequired);
const paidResponse =
  mode === 'mock'
    ? await runMockPayment({
        url,
        payload,
        headers: { 'x-bossraid-launch-reservation': reservationId },
        payer: '0x000000000000000000000000000000000000dEaD',
      })
    : await runWalletPayment({
        url,
        payload,
        paymentRequired,
        headers: { 'x-bossraid-launch-reservation': reservationId },
        account: privateKeyToAccount(normalizeHexPrivateKey(readWalletPrivateKey())),
      });

const paymentResponseHeader = paidResponse.headers.get('payment-response');
const settlement = paymentResponseHeader
  ? decodePaymentResponseHeader(paymentResponseHeader)
  : undefined;
const responseBody = await readBody(paidResponse);

if (!paidResponse.ok) {
  throw new Error(
    `Paid request failed with ${paidResponse.status}: ${formatBody(responseBody)}`
  );
}

if (!paymentResponseHeader) {
  throw new Error('Paid response succeeded but did not include PAYMENT-RESPONSE.');
}

const routerProof =
  route === 'inference'
    ? {
        selectedSeller: responseBody?.bossraid?.selected_seller,
        savingsUsd: responseBody?.bossraid?.savings_usd,
        agentsInvited: responseBody?.raid?.agents_invited,
        model: responseBody?.model,
      }
    : undefined;

if (route === 'inference') {
  if (!routerProof?.selectedSeller) {
    throw new Error(
      `Inference route did not return bossraid.selected_seller: ${JSON.stringify(responseBody)}`
    );
  }
  if (routerProof.agentsInvited !== 1) {
    throw new Error(
      `Expected one-agent inference raid, got agents_invited=${routerProof.agentsInvited}`
    );
  }
}

console.log(
  JSON.stringify(
    {
      step: 'success',
      status: paidResponse.status,
      settlement,
      routerProof,
      body: responseBody,
    },
    null,
    2
  )
);

function readWalletPrivateKey() {
  const rawPrivateKey = process.env.BOSSRAID_X402_BUYER_PRIVATE_KEY ?? process.env.EVM_PRIVATE_KEY;
  if (!rawPrivateKey) {
    throw new Error(
      'BOSSRAID_X402_BUYER_PRIVATE_KEY or EVM_PRIVATE_KEY is required for --mode wallet.'
    );
  }
  return rawPrivateKey;
}

function readReservationId(challengeHeaders, paymentRequired) {
  const reservationId =
    challengeHeaders.get('x-bossraid-launch-reservation') ??
    paymentRequired.accepts?.[0]?.extra?.reservationId;
  if (typeof reservationId !== 'string' || reservationId.length === 0) {
    throw new Error('x-bossraid-launch-reservation is required for x402 payment.');
  }
  return reservationId;
}

async function fetchJson(url, payload, extraHeaders = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    headers: response.headers,
    body: await readBody(response),
  };
}

function routePathFor(route) {
  if (route === 'chat') {
    return 'v1/chat/completions';
  }
  if (route === 'inference') {
    return 'v1/inference/chat/completions';
  }
  return 'v1/raid';
}

function defaultPayloadForRoute(route) {
  if (route === 'inference') {
    return 'examples/inference-chat-completion-request.json';
  }
  return route === 'chat'
    ? 'examples/chat-completion-request.json'
    : 'examples/unity-bug/task.json';
}