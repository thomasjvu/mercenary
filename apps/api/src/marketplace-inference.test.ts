import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ProviderAcceptance } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { NETWORK } from '@bossraid/constants';
import {
  createTestApiServer,
  buildApiServer,
  createProviderProfile,
  createPublicSessionCookie,
  join,
  mkdtemp,
  readFile,
  readyHealth,
  rm,
  tmpdir,
} from './test/helpers.js';

test('GET /v1/models and /v1/markets expose discount inference marketplace data', async () => {
  const cheapProvider: RaidProvider = {
    profile: createProviderProfile('provider-market-cheap', {
      agentFramework: 'codex',
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 0.25,
      pricing: {
        mode: 'token_metered',
        currency: 'USD',
        pricePer1mInputTokensUsd: 0.1,
        pricePer1mOutputTokensUsd: 0.2,
        minimumChargeUsd: 0.03,
        rateCardVersion: 'market-v1',
        rateCardHash: 'market-rate-card-v1',
        upstreamModelId: 'google/gemma-4-31b-it',
        maxContextTokens: 131_072,
      },
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
      verification: {
        status: 'verified',
        apiVerified: true,
        frameworkVerified: true,
        modelVerified: true,
      },
      privacy: {
        teeAttested: true,
        e2ee: true,
        signedOutputs: true,
        noDataRetention: true,
      },
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-market-cheap',
      };
    },
    async run(): Promise<void> {},
  };
  const expensiveProvider: RaidProvider = {
    profile: createProviderProfile('provider-market-expensive', {
      agentFramework: 'claude_code',
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 1.25,
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-market-expensive',
      };
    },
    async run(): Promise<void> {},
  };
  const app = createTestApiServer([expensiveProvider, cheapProvider]);

  try {
    const modelsResponse = await app.inject({
      method: 'GET',
      url: '/v1/models',
    });
    assert.equal(modelsResponse.statusCode, 200);
    assert.deepEqual(
      modelsResponse.json().data.map((model: { id: string }) => model.id),
      ['gpt-5.5']
    );
    assert.equal(modelsResponse.json().data[0].bossraid.cheapest_rate_usd, 0.03);
    assert.equal(modelsResponse.json().data[0].pricing.declaredUnit, 'token_metered');
    assert.equal(modelsResponse.json().data[0].pricing.pricePer1mInputTokensUsd, 0.1);

    const marketsResponse = await app.inject({
      method: 'GET',
      url: '/v1/markets?model_id=gpt-5.5',
    });
    assert.equal(marketsResponse.statusCode, 200);
    const market = marketsResponse.json().data[0];
    assert.equal(market.cheapestRateUsd, 0.03);
    assert.equal(market.pricing.declaredUnit, 'token_metered');
    assert.equal(market.pricing.referenceInputTokens, 1_000);
    assert.equal(market.pricing.referenceOutputTokens, 1_024);
    assert.equal(market.sellers[0].pricing.rateCardHash, 'market-rate-card-v1');
    assert.equal(market.sellers[0].pricing.maxContextTokens, 131_072);
    assert.deepEqual(
      market.sellers.map((seller: { sellerId: string }) => seller.sellerId),
      ['provider-market-cheap', 'provider-market-expensive']
    );
    assert.equal(marketsResponse.json().custody.sellerCredentialPolicy.includes('clean'), true);

    const filteredMarketResponse = await app.inject({
      method: 'GET',
      url: '/v1/markets?model_id=gpt-5.5&max_budget_usd=0.5&privacy_mode=strict&verification_status=verified',
    });
    assert.equal(filteredMarketResponse.statusCode, 200);
    assert.deepEqual(
      filteredMarketResponse
        .json()
        .data[0].sellers.map((seller: { sellerId: string }) => seller.sellerId),
      ['provider-market-cheap']
    );
  } finally {
    await app.close();
  }
});
