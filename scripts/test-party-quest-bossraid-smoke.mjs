import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePaymentResponseHeader, x402Client, x402HTTPClient } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { ExactEvmSchemeV1 } from '@x402/evm/v1';
import { privateKeyToAccount } from 'viem/accounts';
import { loadLocalEnv } from './env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);

const apiBase = requiredUrlFrom([
  'BOSSRAID_API_BASE',
  'BOSSRAID_X402_E2E_API_BASE',
  'VITE_BOSSRAID_API_BASE',
]);
const registryToken = requiredEnv('BOSSRAID_REGISTRY_TOKEN');
const providerId = requiredEnv('PARTY_QUEST_BOSSRAID_PROVIDER_ID');
const providerEndpoint = resolveProviderEndpoint(providerId);
const providerAuthType = process.env.PARTY_QUEST_BOSSRAID_PROVIDER_AUTH_TYPE ?? 'bearer';
const providerToken = process.env.PARTY_QUEST_BOSSRAID_PROVIDER_TOKEN;
const providerSecret = process.env.PARTY_QUEST_BOSSRAID_PROVIDER_SECRET;
const skipProviderRegistration = parseBoolean(process.env.PARTY_QUEST_BOSSRAID_SKIP_REGISTER);
const timeoutMs = Number(process.env.BOSSRAID_SMOKE_TIMEOUT_MS ?? '600000');
const payload = loadPayload();

requirePayAiEnv();
requireWalletEnv();

console.log(
  JSON.stringify(
    {
      step: 'start',
      apiBase,
      providerId,
      providerEndpoint,
      timeoutMs,
    },
    null,
    2
  )
);

await verifyAttestedRuntime(apiBase);
if (skipProviderRegistration) {
  console.log(JSON.stringify({ step: 'provider_registration_skipped', providerId }, null, 2));
} else {
  await registerPartyQuestProvider(apiBase);
}
await verifyProviderHealth(providerEndpoint);
await verifyProviderDiscovery(apiBase, providerId);
const paidRaid = await submitPaidRaid(apiBase, payload);
const result = await waitForResult(apiBase, paidRaid.raidId, paidRaid.raidAccessToken, timeoutMs);
await verifyAttestedResult(apiBase, paidRaid.raidId, paidRaid.raidAccessToken);
verifySmokeResult(result, providerId);

console.log(
  JSON.stringify(
    {
      step: 'success',
      raidId: paidRaid.raidId,
      payment: paidRaid.settlement,
      status: result.status,
    },
    null,
    2
  )
);

function loadPayload() {
  const payloadFile = process.env.BOSSRAID_SMOKE_PAYLOAD_FILE;
  if (payloadFile) {
    const absolute = resolve(rootDir, payloadFile);
    if (!existsSync(absolute)) {
      throw new Error(`BOSSRAID_SMOKE_PAYLOAD_FILE not found: ${absolute}`);
    }
    return JSON.parse(readFileSync(absolute, 'utf8'));
  }

  return {
    agent: 'mercenary-v1',
    taskType: 'party_quest_bridge_smoke',
    task: {
      title: 'Party Quest Boss Raid production smoke',
      description:
        'Run a small end-to-end smoke through the Party Quest formation provider bridge. Return a concise operational summary and any bridge callback evidence.',
      language: 'text',
      framework: 'party-quest',
      files: [
        {
          path: 'SMOKE.md',
          content:
            '# Party Quest Boss Raid Smoke\n\nConfirm provider selection, acceptance, callback progress, submission, settlement mirroring, and receipt evidence.\n',
          sha256: 'party-quest-bossraid-smoke',
        },
      ],
      failingSignals: {
        errors: [],
        reproSteps: [
          'Register the Party Quest formation provider',
          'Pay for a Boss Raid through x402',
          'Let Mercenary select the Party Quest provider',
          'Wait for Party Quest to submit the provider result',
        ],
        expectedBehavior:
          'A Party Quest provider is selected, completes the task, and Boss Raid exposes paid result and attestation evidence.',
      },
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    raidPolicy: {
      maxAgents: 1,
      minReputationScore: 0,
      privacyMode: 'off',
      allowedOutputTypes: ['text'],
      maxTotalCost: Number(process.env.BOSSRAID_SMOKE_MAX_TOTAL_COST ?? '1'),
      selectionMode: 'best_match',
    },
    hostContext: {
      host: 'party-quest',
    },
  };
}

function resolveProviderEndpoint(id) {
  const explicit = process.env.PARTY_QUEST_BOSSRAID_PROVIDER_ENDPOINT;
  if (explicit) {
    return ensureTrailingSlash(explicit);
  }
  const base = process.env.PARTY_QUEST_PUBLIC_HTTP_BASE_URL;
  if (!base) {
    throw new Error(
      'Set PARTY_QUEST_BOSSRAID_PROVIDER_ENDPOINT or PARTY_QUEST_PUBLIC_HTTP_BASE_URL.'
    );
  }
  return ensureTrailingSlash(new URL(`/boss-raid/providers/${id}/`, base).toString());
}

async function verifyAttestedRuntime(base) {
  const response = await fetch(buildApiUrl(base, '/v1/attested-runtime'));
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Attested runtime proof failed (${response.status}): ${formatBody(body)}`);
  }
  if (!body?.signature || !body?.payload) {
    throw new Error(
      `Attested runtime response is missing signature or payload: ${formatBody(body)}`
    );
  }
  const teePlatform = String(body.payload.teePlatform ?? '').toLowerCase();
  if (!teePlatform.includes('phala')) {
    throw new Error(
      `Expected Phala attested runtime, received teePlatform=${teePlatform || 'none'}.`
    );
  }
  console.log(
    JSON.stringify(
      {
        step: 'attested_runtime',
        signer: body.signer,
        teePlatform: body.payload.teePlatform,
        readyProviders: body.payload.readyProviders,
      },
      null,
      2
    )
  );
}

async function registerPartyQuestProvider(base) {
  const body = {
    agentId: providerId,
    name: process.env.PARTY_QUEST_BOSSRAID_PROVIDER_NAME ?? 'Party Quest Formation Smoke',
    description:
      process.env.PARTY_QUEST_BOSSRAID_PROVIDER_DESCRIPTION ??
      'Party Quest formation provider registered for production smoke validation.',
    endpoint: providerEndpoint,
    capabilities: readCsv('PARTY_QUEST_BOSSRAID_CAPABILITIES', ['party-quest']),
    supportedLanguages: readCsv('PARTY_QUEST_BOSSRAID_LANGUAGES', ['text']),
    supportedFrameworks: readCsv('PARTY_QUEST_BOSSRAID_FRAMEWORKS', ['party-quest']),
    outputTypes: readCsv('PARTY_QUEST_BOSSRAID_OUTPUT_TYPES', ['text']),
    modelFamily: process.env.PARTY_QUEST_BOSSRAID_MODEL_FAMILY ?? 'party-quest-formation',
    maxConcurrency: Number(process.env.PARTY_QUEST_BOSSRAID_MAX_CONCURRENCY ?? '1'),
    pricing: {
      pricePerTaskUsd: Number(process.env.PARTY_QUEST_BOSSRAID_PRICE_USD ?? '1'),
    },
    auth: providerAuth(),
    source: {
      type: 'party_quest',
      targetType: process.env.PARTY_QUEST_BOSSRAID_TARGET_TYPE ?? 'formation',
      externalRef: process.env.PARTY_QUEST_BOSSRAID_EXTERNAL_REF ?? providerId,
      displayIcon: process.env.PARTY_QUEST_BOSSRAID_DISPLAY_ICON ?? 'fire-b-fill',
      memberCount: Number(process.env.PARTY_QUEST_BOSSRAID_MEMBER_COUNT ?? '1'),
    },
  };
  const response = await fetch(buildApiUrl(base, '/agents/register'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${registryToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await readBody(response);
  if (!response.ok) {
    throw new Error(`Provider registration failed (${response.status}): ${formatBody(payload)}`);
  }
  console.log(JSON.stringify({ step: 'registered', providerId, response: payload }, null, 2));
}

async function verifyProviderHealth(endpoint) {
  const response = await fetch(new URL('health', endpoint));
  const body = await readBody(response);
  if (!response.ok || body?.ready !== true) {
    throw new Error(`Party Quest provider is not ready (${response.status}): ${formatBody(body)}`);
  }
  console.log(JSON.stringify({ step: 'provider_health', body }, null, 2));
}

async function verifyProviderDiscovery(base, id) {
  const response = await fetch(buildApiUrl(base, '/agents/discover'));
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Provider discovery failed (${response.status}): ${formatBody(body)}`);
  }
  const providers = Array.isArray(body) ? body : [];
  if (!providers.some((provider) => provider?.providerId === id)) {
    throw new Error(`Registered Party Quest provider ${id} was not discoverable.`);
  }
  console.log(JSON.stringify({ step: 'provider_discovered', providerId: id }, null, 2));
}

async function submitPaidRaid(base, raidPayload) {
  const raidUrl = buildApiUrl(base, '/v1/raid');
  const challenge = await fetchJson(raidUrl, raidPayload);
  if (challenge.status !== 402) {
    throw new Error(
      `Expected x402 challenge, got ${challenge.status}: ${formatBody(challenge.body)}`
    );
  }
  const paymentRequiredHeader = challenge.headers.get('payment-required');
  if (!paymentRequiredHeader) {
    throw new Error('Missing PAYMENT-REQUIRED header.');
  }
  const paymentRequired = decodeBase64Json(paymentRequiredHeader);
  const paid = await runWalletPayment(raidUrl, raidPayload, paymentRequired);
  const paymentResponseHeader = paid.headers.get('payment-response');
  const settlement = paymentResponseHeader
    ? decodePaymentResponseHeader(paymentResponseHeader)
    : undefined;
  const body = await readBody(paid);
  if (!paid.ok) {
    throw new Error(`Paid raid failed (${paid.status}): ${formatBody(body)}`);
  }
  if (!settlement?.success) {
    throw new Error(`Paid raid did not return successful settlement: ${formatBody(settlement)}`);
  }
  if (typeof body?.raidId !== 'string' || typeof body?.raidAccessToken !== 'string') {
    throw new Error(`Unexpected paid raid response: ${formatBody(body)}`);
  }
  console.log(
    JSON.stringify(
      {
        step: 'paid_raid_spawned',
        raidId: body.raidId,
        settlement,
      },
      null,
      2
    )
  );
  return {
    raidId: body.raidId,
    raidAccessToken: body.raidAccessToken,
    settlement,
  };
}

async function runWalletPayment(url, payload, paymentRequired) {
  const rawPrivateKey = process.env.BOSSRAID_X402_BUYER_PRIVATE_KEY ?? process.env.EVM_PRIVATE_KEY;
  const account = privateKeyToAccount(normalizeHexPrivateKey(rawPrivateKey));
  const client = x402Client.fromConfig({
    schemes: [
      ...['base-sepolia', 'base', 'sepolia', 'ethereum'].map((network) => ({
        x402Version: 1,
        network,
        client: new ExactEvmSchemeV1(account),
      })),
      {
        network: 'eip155:*',
        client: new ExactEvmScheme(account),
      },
    ],
  });
  const httpClient = new x402HTTPClient(client);
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const reservationId = paymentRequired.accepts?.[0]?.extra?.reservationId;
  if (typeof reservationId !== 'string' || reservationId.length === 0) {
    throw new Error('PAYMENT-REQUIRED did not include a reservationId.');
  }
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bossraid-launch-reservation': reservationId,
      ...httpClient.encodePaymentSignatureHeader(paymentPayload),
    },
    body: JSON.stringify(payload),
  });
}

async function waitForResult(base, raidId, raidAccessToken, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  const resultUrl = buildApiUrl(base, `/v1/raid/${encodeURIComponent(raidId)}/result`);
  while (Date.now() < deadline) {
    const response = await fetch(resultUrl, {
      headers: {
        'x-bossraid-raid-token': raidAccessToken,
      },
    });
    const body = await readBody(response);
    if (!response.ok) {
      throw new Error(`Result poll failed (${response.status}): ${formatBody(body)}`);
    }
    if (body?.status === 'final') {
      return body;
    }
    console.log(JSON.stringify({ step: 'poll', status: body?.status ?? 'unknown' }, null, 2));
    await sleep(5_000);
  }
  throw new Error(`Timed out waiting for final raid result for ${raidId}.`);
}

async function verifyAttestedResult(base, raidId, raidAccessToken) {
  const response = await fetch(
    buildApiUrl(base, `/v1/raid/${encodeURIComponent(raidId)}/attested-result`),
    {
      headers: {
        'x-bossraid-raid-token': raidAccessToken,
      },
    }
  );
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Attested result proof failed (${response.status}): ${formatBody(body)}`);
  }
  if (!body?.signature || body?.payload?.raidId !== raidId) {
    throw new Error(`Attested result response is missing proof data: ${formatBody(body)}`);
  }
  console.log(
    JSON.stringify(
      {
        step: 'attested_result',
        signer: body.signer,
        raidId: body.payload.raidId,
        resultHash: body.payload.resultHash,
      },
      null,
      2
    )
  );
}

function verifySmokeResult(result, id) {
  const selectedProviderIds = new Set(
    (result.routingProof?.providers ?? []).map((provider) => provider.providerId)
  );
  if (!selectedProviderIds.has(id)) {
    throw new Error(
      `Mercenary did not select the Party Quest provider. Selected: ${JSON.stringify([...selectedProviderIds])}`
    );
  }
  if (!result.synthesizedOutput?.answerText && !result.synthesizedOutput?.patchUnifiedDiff) {
    throw new Error('Final result did not include a synthesized answer or patch.');
  }
  if (!result.settlementExecution) {
    throw new Error('Final result did not include settlement execution data.');
  }
}

async function fetchJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await readBody(response),
  };
}

async function readBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function providerAuth() {
  if (providerAuthType === 'bearer') {
    if (!providerToken) {
      throw new Error('PARTY_QUEST_BOSSRAID_PROVIDER_TOKEN is required for bearer auth.');
    }
    return {
      type: 'bearer',
      token: providerToken,
    };
  }
  if (providerAuthType === 'hmac') {
    if (!providerSecret) {
      throw new Error('PARTY_QUEST_BOSSRAID_PROVIDER_SECRET is required for hmac auth.');
    }
    return {
      type: 'hmac',
      secret: providerSecret,
    };
  }
  if (providerAuthType === 'none') {
    return { type: 'none' };
  }
  throw new Error('PARTY_QUEST_BOSSRAID_PROVIDER_AUTH_TYPE must be bearer, hmac, or none.');
}

function requirePayAiEnv() {
  requiredEnv('PAYAI_API_KEY_ID');
  requiredEnv('PAYAI_API_KEY_SECRET');
}

function requireWalletEnv() {
  if (!process.env.BOSSRAID_X402_BUYER_PRIVATE_KEY && !process.env.EVM_PRIVATE_KEY) {
    throw new Error('BOSSRAID_X402_BUYER_PRIVATE_KEY or EVM_PRIVATE_KEY is required.');
  }
}

function requiredUrlFrom(names) {
  const found = names.find((name) => process.env[name]?.trim());
  if (!found) {
    throw new Error(`${names.join(' or ')} is required.`);
  }
  const value = requiredEnv(found);
  return ensureTrailingSlash(value);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildApiUrl(base, relativePath) {
  const url = new URL(base);
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  url.search = '';
  url.hash = '';
  return new URL(relativePath.replace(/^\/+/, ''), url);
}

function readCsv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function decodeBase64Json(value) {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

function normalizeHexPrivateKey(value) {
  return value.startsWith('0x') ? value : `0x${value}`;
}

function formatBody(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
