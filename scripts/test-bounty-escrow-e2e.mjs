import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePaymentResponseHeader } from '@x402/fetch';
import { x402Client, x402HTTPClient } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { ExactEvmSchemeV1 } from '@x402/evm/v1';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadLocalEnv } from './env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);

const apiBase = requiredUrlFrom([
  'BOSSRAID_API_BASE',
  'BOSSRAID_X402_E2E_API_BASE',
  'VITE_BOSSRAID_API_BASE',
]);
const mode = process.env.BOSSRAID_BOUNTY_E2E_MODE ?? process.env.BOSSRAID_X402_E2E_MODE ?? 'mock';
const providerId = requiredEnv('BOSSRAID_BOUNTY_E2E_PROVIDER_ID');
const providerToken = requiredEnv('BOSSRAID_BOUNTY_E2E_PROVIDER_TOKEN');
const rewardUsd = Number(process.env.BOSSRAID_BOUNTY_E2E_REWARD_USD ?? '0.5');

if (!Number.isFinite(rewardUsd) || rewardUsd <= 0) {
  throw new Error('BOSSRAID_BOUNTY_E2E_REWARD_USD must be a positive number.');
}

const posterAccount = privateKeyToAccount(
  normalizeHexPrivateKey(
    process.env.BOSSRAID_BOUNTY_E2E_POSTER_PRIVATE_KEY ??
      process.env.BOSSRAID_X402_BUYER_PRIVATE_KEY ??
      process.env.EVM_PRIVATE_KEY
  )
);

console.log(
  JSON.stringify(
    {
      step: 'start',
      apiBase,
      mode,
      providerId,
      poster: posterAccount.address,
      rewardUsd,
    },
    null,
    2
  )
);

const session = await createWalletSession(apiBase, posterAccount);
const created = await createBounty(apiBase, session.cookie, rewardUsd);
const funded = await fundBounty(apiBase, session.cookie, created.bounty.id, mode);
const bid = await submitBid(apiBase, created.bounty.id, providerId, providerToken, rewardUsd);
const awarded = await awardBids(apiBase, session.cookie, created.bounty.id, bid.bid.id);
const awardId = awarded.awards[0].id;
const artifactsJson = JSON.stringify({ smoke: 'bounty-escrow-e2e', at: new Date().toISOString() });
const deliveryHash = createHash('sha256').update(artifactsJson).digest('hex');
const delivered = await deliverAward(
  apiBase,
  created.bounty.id,
  awardId,
  providerToken,
  artifactsJson,
  deliveryHash
);
const accepted = await acceptAward(apiBase, session.cookie, created.bounty.id, awardId);

await verifyOnchainAwardIfConfigured(awarded.awards[0].onchainAwardId);

console.log(
  JSON.stringify(
    {
      step: 'success',
      bountyId: created.bounty.id,
      onchainEscrow: funded.onchainEscrow ?? false,
      escrowJobId: funded.bounty.escrowJobId ?? null,
      awardId,
      onchainAwardId: awarded.awards[0].onchainAwardId ?? null,
      deliveredStatus: delivered.award.status,
      acceptedStatus: accepted.award.status,
      fundSettlement: funded.settlement ?? null,
    },
    null,
    2
  )
);

async function createWalletSession(base, account) {
  const nonceResponse = await fetch(buildApiUrl(base, '/v1/auth/nonce'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: account.address }),
  });
  const nonceBody = await readBody(nonceResponse);
  if (!nonceResponse.ok) {
    throw new Error(`Nonce request failed (${nonceResponse.status}): ${formatBody(nonceBody)}`);
  }
  const signature = await account.signMessage({ message: nonceBody.message });
  const verifyResponse = await fetch(buildApiUrl(base, '/v1/auth/verify'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: nonceBody.message, signature }),
  });
  const verifyBody = await readBody(verifyResponse);
  if (!verifyResponse.ok) {
    throw new Error(`Verify failed (${verifyResponse.status}): ${formatBody(verifyBody)}`);
  }
  const cookie = verifyResponse.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('Wallet verify did not return a session cookie.');
  }
  return { cookie, wallet: account.address.toLowerCase() };
}

async function createBounty(base, cookie, amountUsd) {
  const response = await fetch(buildApiUrl(base, '/v1/bounties'), {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Bounty escrow e2e',
      description: 'Automated bounty escrow smoke test',
      requirements: 'Return a JSON artifact and matching delivery hash.',
      rewardAmountUsd: amountUsd,
    }),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Create bounty failed (${response.status}): ${formatBody(body)}`);
  }
  console.log(JSON.stringify({ step: 'bounty_created', bountyId: body.bounty.id }, null, 2));
  return body;
}

async function fundBounty(base, cookie, bountyId, paymentMode) {
  const url = buildApiUrl(base, `/v1/bounties/${encodeURIComponent(bountyId)}/fund`);
  const challenge = await fetch(url, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ openNow: true }),
  });
  const challengeBody = await readBody(challenge);
  if (challenge.status !== 402) {
    throw new Error(`Expected 402 fund challenge, got ${challenge.status}: ${formatBody(challengeBody)}`);
  }
  const paymentRequiredHeader = challenge.headers.get('payment-required');
  if (!paymentRequiredHeader) {
    throw new Error('Missing PAYMENT-REQUIRED header on bounty fund challenge.');
  }
  const paymentRequired = decodeBase64Json(paymentRequiredHeader);
  const paid =
    paymentMode === 'wallet'
      ? await runWalletPayment(url, { openNow: true }, paymentRequired, cookie)
      : await runMockPayment(url, { openNow: true }, cookie);
  const settlementHeader = paid.headers.get('payment-response');
  const settlement = settlementHeader ? decodePaymentResponseHeader(settlementHeader) : undefined;
  const body = await readBody(paid);
  if (!paid.ok) {
    throw new Error(`Fund bounty failed (${paid.status}): ${formatBody(body)}`);
  }
  if (!settlement?.success) {
    throw new Error(`Fund bounty did not settle: ${formatBody(settlement)}`);
  }
  console.log(
    JSON.stringify(
      {
        step: 'bounty_funded',
        bountyId,
        onchainEscrow: body.onchainEscrow,
        escrowJobId: body.bounty?.escrowJobId,
        settlement,
      },
      null,
      2
    )
  );
  return { ...body, settlement };
}

async function submitBid(base, bountyId, id, token, amountUsd) {
  const response = await fetch(buildApiUrl(base, `/v1/bounties/${encodeURIComponent(bountyId)}/bids`), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      providerId: id,
      priceUsd: amountUsd,
      etaHours: 1,
      pitch: 'Automated smoke bid.',
    }),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Submit bid failed (${response.status}): ${formatBody(body)}`);
  }
  console.log(JSON.stringify({ step: 'bid_submitted', bidId: body.bid.id }, null, 2));
  return body;
}

async function awardBids(base, cookie, bountyId, bidId) {
  const response = await fetch(buildApiUrl(base, `/v1/bounties/${encodeURIComponent(bountyId)}/award`), {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ bidIds: [bidId] }),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Award failed (${response.status}): ${formatBody(body)}`);
  }
  console.log(JSON.stringify({ step: 'bid_awarded', awards: body.awards }, null, 2));
  return body;
}

async function deliverAward(base, bountyId, awardId, token, artifactsJson, deliveryHash) {
  const response = await fetch(
    buildApiUrl(base, `/v1/bounties/${encodeURIComponent(bountyId)}/awards/${encodeURIComponent(awardId)}/deliver`),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        artifactSummary: 'Smoke delivery',
        artifactsJson,
        deliveryHash,
      }),
    }
  );
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Deliver failed (${response.status}): ${formatBody(body)}`);
  }
  return body;
}

async function acceptAward(base, cookie, bountyId, awardId) {
  const response = await fetch(
    buildApiUrl(base, `/v1/bounties/${encodeURIComponent(bountyId)}/awards/${encodeURIComponent(awardId)}/accept`),
    {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(`Accept failed (${response.status}): ${formatBody(body)}`);
  }
  return body;
}

async function verifyOnchainAwardIfConfigured(onchainAwardId) {
  const rpcUrl = process.env.BOSSRAID_RPC_URL;
  const bountyEscrowAddress = process.env.BOSSRAID_BOUNTY_ESCROW_ADDRESS;
  if (!onchainAwardId || !rpcUrl || !bountyEscrowAddress) {
    console.log(JSON.stringify({ step: 'onchain_verify_skipped' }, null, 2));
    return;
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  const award = await client.readContract({
    address: bountyEscrowAddress,
    abi: [
      {
        type: 'function',
        name: 'awards',
        stateMutability: 'view',
        inputs: [{ name: 'awardId', type: 'uint256' }],
        outputs: [
          { name: 'provider', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'deliveryHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
          { name: 'deliveredAt', type: 'uint256' },
        ],
      },
    ],
    functionName: 'awards',
    args: [BigInt(onchainAwardId)],
  });
  const status = Number(award[3]);
  if (status !== 3) {
    throw new Error(`Expected onchain award status Paid (3), got ${status}.`);
  }
  console.log(JSON.stringify({ step: 'onchain_award_paid', onchainAwardId, status }, null, 2));
}

async function runMockPayment(url, payload, cookie) {
  return fetch(url, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      'payment-signature': encodeBase64Json({
        proof: 'facilitator-signed-payment',
        payer: posterAccount.address,
      }),
    },
    body: JSON.stringify(payload),
  });
}

async function runWalletPayment(url, payload, paymentRequired, cookie) {
  const client = x402Client.fromConfig({
    schemes: [
      ...['base-sepolia', 'base', 'sepolia', 'ethereum'].map((network) => ({
        x402Version: 1,
        network,
        client: new ExactEvmSchemeV1(posterAccount),
      })),
      { network: 'eip155:*', client: new ExactEvmScheme(posterAccount) },
    ],
  });
  const httpClient = new x402HTTPClient(client);
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  return fetch(url, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      ...httpClient.encodePaymentSignatureHeader(paymentPayload),
    },
    body: JSON.stringify(payload),
  });
}

function buildApiUrl(base, path) {
  return new URL(path.replace(/^\/+/, ''), base.endsWith('/') ? base : `${base}/`).toString();
}

function decodeBase64Json(value) {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatBody(body) {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function normalizeHexPrivateKey(value) {
  return value.startsWith('0x') ? value : `0x${value}`;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function requiredUrlFrom(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing API base env. Set one of: ${names.join(', ')}`);
}