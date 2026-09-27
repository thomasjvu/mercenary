import assert from 'node:assert/strict';
import test from 'node:test';
import { UPSTREAM_PROVIDER_IDS, INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import {
  PLATFORM_LIQUIDITY_FULL_CATALOG_PROVIDERS,
  PLATFORM_LIQUIDITY_WALLET,
  bootstrapPlatformLiquidity,
  listPlatformLiquidityCandidates,
  listPlatformLiquidityModelIds,
  resolveHostedUpstreamApiKey,
} from './platform-liquidity.js';

test('listPlatformLiquidityModelIds includes full marketplace catalogs', () => {
  const ids = listPlatformLiquidityModelIds();
  assert.ok(ids.includes('grok-4.5'));
  assert.ok(ids.includes('google-gemma-4-31b-it'));
  assert.ok(ids.some((id) => id.startsWith('chutes-')));
  assert.ok(ids.some((id) => id.startsWith('near/')));
  assert.ok(ids.some((id) => id.startsWith('redpill/')));
  assert.ok(ids.some((id) => id.startsWith('phala/')));
  assert.ok(ids.some((id) => id.startsWith('darkbloom/')));
  assert.ok(ids.length >= 100);
  assert.deepEqual(
    [...PLATFORM_LIQUIDITY_FULL_CATALOG_PROVIDERS].sort(),
    [...UPSTREAM_PROVIDER_IDS].sort()
  );
});

test('listPlatformLiquidityCandidates marks keys from env', () => {
  const candidates = listPlatformLiquidityCandidates({
    BOSSRAID_ANTHROPIC_API_KEY: 'sk-ant-test',
  });
  const anthropic = candidates.filter((entry) => entry.upstream === 'anthropic');
  assert.ok(anthropic.length >= 1);
  assert.ok(anthropic.every((entry) => entry.hasPlatformKey));
  const venice = candidates.filter((entry) => entry.upstream === 'venice');
  assert.ok(venice.length >= 50);
  assert.ok(venice.every((entry) => entry.hasPlatformKey === false));
  const chutes = candidates.filter((entry) => entry.upstream === 'chutes');
  assert.ok(chutes.length >= 1);
  assert.ok(chutes.every((entry) => entry.hasPlatformKey === false));
});

test('resolveHostedUpstreamApiKey falls back to platform env key', () => {
  const key = resolveHostedUpstreamApiKey({
    controlState: {
      readSellerUpstreamApiKey: () => undefined,
    },
    wallet: PLATFORM_LIQUIDITY_WALLET,
    upstream: 'anthropic',
    env: { BOSSRAID_ANTHROPIC_API_KEY: 'sk-ant-platform' },
  });
  assert.equal(key, 'sk-ant-platform');
});

test('bootstrapPlatformLiquidity skips models without platform keys', async () => {
  const upserted: string[] = [];
  const result = await bootstrapPlatformLiquidity({
    orchestrator: {
      listProviders: () => [],
      async upsertRegisteredProvider(input: { agentId?: string; providerId?: string }) {
        const id = input.agentId ?? input.providerId ?? 'unknown';
        upserted.push(id);
        return { providerId: id };
      },
      async removeRegisteredProvider() {
        return false;
      },
    } as never,
    env: {},
  });
  assert.equal(result.published.length, 0);
  assert.ok(result.skipped.length >= 1);
  assert.equal(upserted.length, 0);
});

test('bootstrapPlatformLiquidity publishes when platform keys present', async () => {
  const upserted: string[] = [];
  const result = await bootstrapPlatformLiquidity({
    orchestrator: {
      listProviders: () => [],
      async upsertRegisteredProvider(input: { agentId?: string }) {
        const id = input.agentId ?? 'unknown';
        upserted.push(id);
        return { providerId: id };
      },
      async removeRegisteredProvider() {
        return false;
      },
    } as never,
    env: {
      BOSSRAID_UPSTREAM_MOCK: '1',
      BOSSRAID_ANTHROPIC_API_KEY: 'sk-ant-test',
      BOSSRAID_VENICE_API_KEY: 'vn_test',
      BOSSRAID_CHUTES_API_KEY: 'ch_test',
    },
  });
  assert.ok(result.published.length >= 50);
  assert.ok(result.published.every((entry) => entry.providerId.startsWith('platform-')));
  assert.ok(result.published.some((entry) => entry.upstream === 'venice'));
  assert.ok(result.published.some((entry) => entry.upstream === 'chutes'));
  assert.ok(upserted.length >= 50);
});

test('platform bootstrap publishes only listed models that pass completion and pauses failures', async (t) => {
  const [good, bad] = INFERENCE_MODEL_CATALOG.filter((m) => m.modelProvider === 'openai');
  const published: string[] = [];
  const paused: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    if (String(url).endsWith('/models'))
      return Response.json({
        data: [{ id: good.upstreamModelId }, { id: bad.upstreamModelId }, { id: 'unknown-model' }],
      });
    const body = JSON.parse(String(options.body));
    return body.model === good.upstreamModelId
      ? Response.json({
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        })
      : new Response('', { status: 403 });
  });
  const result = await bootstrapPlatformLiquidity({
    orchestrator: {
      listProviders: () => [
        {
          providerId: 'old-bad',
          modelId: bad.modelId,
          source: { externalRef: 'platform', targetType: 'openai' },
        },
      ],
      pauseRegisteredProvider: async (id: string) => {
        paused.push(id);
      },
      upsertRegisteredProvider: async (input: { agentId: string }) => {
        published.push(input.agentId);
        return { providerId: input.agentId };
      },
      removeRegisteredProvider: async () => false,
    } as never,
    env: { NODE_ENV: 'production', BOSSRAID_OPENAI_API_KEY: 'test-key' },
  });
  assert.equal(result.published.length, 1);
  assert.equal(published.length, 1);
  assert.ok(result.skipped.some((m) => m.reason === 'live_unpriced'));
  assert.ok(result.skipped.some((m) => m.modelId === bad.modelId && m.reason === 'live_failed'));
  assert.deepEqual(paused, ['old-bad']);
});
