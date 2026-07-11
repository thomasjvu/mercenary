import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHostedProviderRegistration, harnessKindForUpstream } from './upstream-offers.js';

test('harnessKindForUpstream maps plan providers', () => {
  assert.equal(harnessKindForUpstream('zai'), 'glm');
  assert.equal(harnessKindForUpstream('xai'), 'grok');
  assert.equal(harnessKindForUpstream('chutes'), 'chutes');
  assert.equal(harnessKindForUpstream('venice'), 'codex');
});

test('buildHostedProviderRegistration harness lane sets harness_hosted profile', () => {
  const reg = buildHostedProviderRegistration({
    provider: 'zai',
    wallet: '0xabc1230000000000000000000000000000000001',
    modelId: 'glm-4.7',
    discountPercent: 10,
    payoutWallet: '0xabc1230000000000000000000000000000000001',
    lane: 'harness',
  });
  assert.ok(reg);
  assert.equal(reg?.source?.type, 'harness_hosted');
  assert.equal(reg?.harnessProfile?.lane, 'agent_harness');
  assert.equal(reg?.harnessProfile?.installation, 'fresh');
  assert.equal(reg?.agentFramework, 'glm');
  assert.ok(reg?.agentId?.includes('harness'));
  assert.ok(reg?.outputTypes?.includes('patch'));
});

test('buildHostedProviderRegistration chat lane remains inference_hosted', () => {
  const reg = buildHostedProviderRegistration({
    provider: 'chutes',
    wallet: '0xabc1230000000000000000000000000000000001',
    modelId: 'tee-qwen3-5-122b-chutes',
    discountPercent: 0,
    payoutWallet: '0xabc1230000000000000000000000000000000001',
    lane: 'chat',
  });
  assert.ok(reg);
  assert.equal(reg?.source?.type, 'inference_hosted');
  assert.equal(reg?.harnessProfile?.lane, 'api_chat');
  assert.equal(reg?.agentFramework, 'chutes');
});
