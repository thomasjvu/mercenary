import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLATFORM_LIQUIDITY_WALLET,
  bootstrapPlatformLiquidity,
  listPlatformLiquidityCandidates,
  resolveHostedUpstreamApiKey,
} from './platform-liquidity.js';

test('listPlatformLiquidityCandidates marks keys from env', () => {
  const candidates = listPlatformLiquidityCandidates({
    BOSSRAID_ANTHROPIC_API_KEY: 'sk-ant-test',
  });
  const anthropic = candidates.filter((entry) => entry.upstream === 'anthropic');
  assert.ok(anthropic.length >= 1);
  assert.ok(anthropic.every((entry) => entry.hasPlatformKey));
  const venice = candidates.find((entry) => entry.upstream === 'venice');
  if (venice) {
    assert.equal(venice.hasPlatformKey, false);
  }
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
      async upsertRegisteredProvider(input: { agentId?: string; providerId?: string }) {
        const id = input.agentId ?? input.providerId ?? 'unknown';
        upserted.push(id);
        return { providerId: id };
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
      async upsertRegisteredProvider(input: { agentId?: string }) {
        const id = input.agentId ?? 'unknown';
        upserted.push(id);
        return { providerId: id };
      },
    } as never,
    env: {
      BOSSRAID_ANTHROPIC_API_KEY: 'sk-ant-test',
      BOSSRAID_VENICE_API_KEY: 'vn_test',
    },
  });
  assert.ok(result.published.length >= 1);
  assert.ok(result.published.every((entry) => entry.providerId.startsWith('platform-')));
  assert.ok(upserted.length >= 1);
});
