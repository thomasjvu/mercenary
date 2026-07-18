import { createHash } from 'node:crypto';
import { decodePaymentResponseHeader } from '@x402/fetch';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildApiUrl,
  decodeBase64Json,
  formatBody,
  normalizeHexPrivateKey,
  readBody,
} from './http-e2e.mjs';
import { runMockPayment, runWalletPayment } from './x402-e2e-payment.mjs';

export async function runBountyEscrowE2e(input) {
  const posterAccount = privateKeyToAccount(normalizeHexPrivateKey(input.posterPrivateKey));

  console.log(
    JSON.stringify(
      {
        step: 'start',
        apiBase: input.apiBase,
        mode: input.mode,
        providerId: input.providerId,
        poster: posterAccount.address,
        rewardUsd: input.rewardUsd,
        onchainVerify: input.onchainVerify,
      },
      null,
      2
    )
  );

  const session = await createWalletSession(input.apiBase, posterAccount);
  const created = await createBounty(input.apiBase, session.cookie, input.rewardUsd);
  const funded = await fundBounty(
    input.apiBase,
    session.cookie,
    created.bounty.id,
    input.mode,
    posterAccount
  );
  const bid = await submitBid(
    input.apiBase,
    created.bounty.id,
    input.providerId,
    input.providerToken,
    input.rewardUsd
  );
  const awarded = await awardBids(input.apiBase, session.cookie, created.bounty.id, bid.bid.id);
  const awardId = awarded.awards[0].id;
  const artifactsJson = JSON.stringify({
    smoke: 'bounty-escrow-e2e',
    at: new Date().toISOString(),
  });
  const deliveryHash = createHash('sha256').update(artifactsJson).digest('hex');
  const delivered = await deliverAward(
    input.apiBase,
    created.bounty.id,
    awardId,
    input.providerToken,
    artifactsJson,
    deliveryHash
  );
  const accepted = await acceptAward(input.apiBase, session.cookie, created.bounty.id, awardId);

  await verifyOnchainAwardIfConfigured(awarded.awards[0].onchainAwardId, input.onchainVerify);

  const result = {
    step: 'success',
    bountyId: created.bounty.id,
    onchainEscrow: funded.onchainEscrow ?? false,
    escrowJobId: funded.bounty.escrowJobId ?? null,
    awardId,
    onchainAwardId: awarded.awards[0].onchainAwardId ?? null,
    deliveredStatus: delivered.award.status,
    acceptedStatus: accepted.award.status,
    fundSettlement: funded.settlement ?? null,
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

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

async function fundBounty(base, cookie, bountyId, paymentMode, posterAccount) {
  const url = buildApiUrl(base, `/v1/bounties/${encodeURIComponent(bountyId)}/fund`);
  const payload = { openNow: true };

  if (paymentMode === 'unverified') {
    const response = await fetch(url, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await readBody(response);
    if (!response.ok) {
      throw new Error(`Fund bounty failed (${response.status}): ${formatBody(body)}`);
    }
    console.log(
      JSON.stringify(
        {
          step: 'bounty_funded',
          bountyId,
          onchainEscrow: body.onchainEscrow,
          escrowJobId: body.bounty?.escrowJobId,
          mode: 'unverified',
        },
        null,
        2
      )
    );
    return { ...body, settlement: undefined };
  }

  const challenge = await fetch(url, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const challengeBody = await readBody(challenge);
  if (challenge.status !== 402) {
    throw new Error(
      `Expected 402 fund challenge, got ${challenge.status}: ${formatBody(challengeBody)}`
    );
  }
  const paymentRequiredHeader = challenge.headers.get('payment-required');
  if (!paymentRequiredHeader) {
    throw new Error('Missing PAYMENT-REQUIRED header on bounty fund challenge.');
  }
  const paymentRequired = decodeBase64Json(paymentRequiredHeader);
  const paid =
    paymentMode === 'wallet'
      ? await runWalletPayment({
          url,
          payload,
          paymentRequired,
          headers: { cookie },
          account: posterAccount,
        })
      : await runMockPayment({
          url,
          payload,
          headers: { cookie },
          payer: posterAccount.address,
        });
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

async function verifyOnchainAwardIfConfigured(onchainAwardId, onchainVerify) {
  const rpcUrl = process.env.BOSSRAID_RPC_URL;
  const bountyEscrowAddress = process.env.BOSSRAID_BOUNTY_ESCROW_ADDRESS;
  if (!onchainVerify || !onchainAwardId || !rpcUrl || !bountyEscrowAddress) {
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
          { name: 'bountyId', type: 'uint256' },
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
  // AwardStatus: Pending=0, Delivered=1, Paid=2, Forfeited=3
  const status = Number(award[4]);
  if (status !== 2) {
    throw new Error(`Expected onchain award status Paid (2), got ${status}.`);
  }
  console.log(JSON.stringify({ step: 'onchain_award_paid', onchainAwardId, status }, null, 2));
}