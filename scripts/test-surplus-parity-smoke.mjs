#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mnemonicToAccount } from 'viem/accounts';
import { loadLocalEnv } from './env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);

const apiBase = process.env.BOSSRAID_API_BASE ?? 'http://127.0.0.1:8787';
const inferenceTimeoutMs = Number(process.env.BOSSRAID_SMOKE_TIMEOUT_MS ?? '120000');
const mnemonic =
  process.env.BOSSRAID_SMOKE_MNEMONIC ??
  'test test test test test test test test test test test junk';

async function main() {
  const steps = [];
  const health = await fetchJson(`${apiBase}/health`);
  const providerReady = (health.body?.readyProviders ?? 0) > 0;
  steps.push({
    step: 'health',
    ok: health.status === 200 && providerReady,
    body: health.body,
  });

  const stats = await fetchJson(`${apiBase}/v1/marketplace/stats`);
  steps.push({ step: 'marketplace_stats', ok: stats.status === 200, body: stats.body });

  const markets = await fetchJson(`${apiBase}/v1/markets`);
  const modelCount = markets.body?.data?.length ?? 0;
  const hasVeniceUncensored = (markets.body?.data ?? []).some(
    (market) => market.modelId === 'venice-uncensored-1-2'
  );
  steps.push({
    step: 'markets',
    ok: markets.status === 200 && Array.isArray(markets.body?.data) && modelCount >= 80 && hasVeniceUncensored,
    body: {
      stats: markets.body?.stats,
      modelCount,
      hasVeniceUncensored,
    },
  });

  const account = mnemonicToAccount(mnemonic, { addressIndex: 42 });
  const nonce = await fetchJson(`${apiBase}/v1/auth/nonce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: account.address }),
  });
  const message = nonce.body?.message;
  const signature = await account.signMessage({ message });
  const verify = await fetchJson(`${apiBase}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  const cookie = verify.headers.get('set-cookie') ?? '';
  steps.push({ step: 'wallet_session', ok: verify.status === 200, wallet: account.address });

  const funded = await fetchJson(`${apiBase}/v1/buyer/balance/fund`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ amountUsd: 2 }),
  });
  const fundOk =
    funded.status === 200 ||
    (funded.status === 402 && funded.body?.error === 'payment_required');
  steps.push({
    step: 'fund_balance',
    ok: fundOk,
    body: funded.body,
    note:
      funded.status === 402
        ? 'skipped: x402 required; inference uses API key spend cap'
        : undefined,
  });

  const keyCreate = await fetchJson(`${apiBase}/v1/buyer/api-keys`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'smoke-parity-key', spendLimitUsd: 5 }),
  });
  const apiKey = keyCreate.body?.apiKey;
  steps.push({ step: 'create_api_key', ok: keyCreate.status === 201 && typeof apiKey === 'string' });

  const inference = await fetchJson(`${apiBase}/v1/inference/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.BOSSRAID_SMOKE_MODEL ?? 'gpt-5.5',
      messages: [{ role: 'user', content: 'Reply with one short sentence for the smoke test.' }],
      raid_policy: { max_total_cost: 5 },
    }),
    timeoutMs: inferenceTimeoutMs,
  });
  steps.push({
    step: 'inference_api_key',
    ok: inference.status === 200,
    status: inference.status,
    body:
      inference.status === 200
        ? {
            model: inference.body?.model,
            seller: inference.body?.bossraid?.selected_seller,
            savingsUsd: inference.body?.bossraid?.savings_usd,
            raidId: inference.body?.raid?.raid_id,
          }
        : inference.body,
  });

  const purchases = await fetchJson(`${apiBase}/v1/buyer/purchases`, {
    headers: { cookie },
  });
  steps.push({
    step: 'buyer_purchases',
    ok: purchases.status === 200 && (purchases.body?.data?.length ?? 0) > 0,
    body: purchases.body,
  });

  const balance = await fetchJson(`${apiBase}/v1/buyer/balance`, { headers: { cookie } });
  steps.push({ step: 'buyer_balance', ok: balance.status === 200, body: balance.body });

  const failed = steps.filter((step) => !step.ok);
  console.log(JSON.stringify({ apiBase, steps, failed: failed.map((step) => step.step) }, null, 2));
  if (failed.length > 0) {
    process.exit(1);
  }
}

async function fetchJson(url, init = {}) {
  const { timeoutMs, ...requestInit } = init;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout =
    controller && timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
  const response = await fetch(url, {
    ...requestInit,
    ...(controller ? { signal: controller.signal } : {}),
  });
  if (timeout) {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});