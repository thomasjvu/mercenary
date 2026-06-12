import { DEFAULTS } from '@bossraid/constants';
import * as buyerLedger from './control-state/buyer-ledger.js';
import * as rateLimits from './control-state/rate-limits.js';
import * as sellerLedger from './control-state/seller-ledger.js';
import * as sellerUpstream from './control-state/seller-upstream.js';
import { createSecretCipher } from '@bossraid/persistence';
import * as sessions from './control-state/sessions.js';
import { ControlStateContext } from './control-state/state-context.js';
import { createApiControlStateStore } from './control-state/store.js';
import type {
  ApiControlStateStore,
  ApiOpsSessionEntry,
  ApiRuntimeSettings,
  BuyerApiKeyEntry,
  BuyerPurchaseEntry,
  PublicAccountEntry,
  PublicAuthNonceEntry,
  PublicSessionEntry,
  SellerPayoutEntry,
  SellerUpstreamConfigEntry,
} from './control-state/types.js';

export type {
  ApiRuntimeSettings,
  BuyerApiKeyEntry,
  BuyerPurchaseEntry,
  PublicAccountEntry,
  PublicAuthNonceEntry,
  PublicSessionEntry,
  SellerPayoutEntry,
  SellerUpstreamConfigEntry,
};

export class ApiControlState {
  private readonly ctx: ControlStateContext;

  constructor(store: ApiControlStateStore) {
    this.ctx = new ControlStateContext(store);
  }

  readOpsSession(token: string | undefined, nowMs = Date.now()): ApiOpsSessionEntry | undefined {
    return sessions.readOpsSession(this.ctx, token, nowMs);
  }

  issueOpsSession(ttlSec: number, nowMs = Date.now()): ApiOpsSessionEntry {
    return sessions.issueOpsSession(this.ctx, ttlSec, nowMs);
  }

  clearOpsSession(token: string | undefined, nowMs = Date.now()): void {
    sessions.clearOpsSession(this.ctx, token, nowMs);
  }

  createPublicAuthNonce(
    wallet: string | undefined,
    ttlSec: number,
    nowMs = Date.now()
  ): PublicAuthNonceEntry {
    return sessions.createPublicAuthNonce(this.ctx, wallet, ttlSec, nowMs);
  }

  consumePublicAuthNonce(
    nonce: string,
    wallet: string | undefined,
    nowMs = Date.now()
  ): PublicAuthNonceEntry | undefined {
    return sessions.consumePublicAuthNonce(this.ctx, nonce, wallet, nowMs);
  }

  issuePublicSession(wallet: string, ttlSec: number, nowMs = Date.now()): PublicSessionEntry {
    return sessions.issuePublicSession(this.ctx, wallet, ttlSec, nowMs);
  }

  readPublicSession(token: string | undefined, nowMs = Date.now()): PublicSessionEntry | undefined {
    return sessions.readPublicSession(this.ctx, token, nowMs);
  }

  clearPublicSession(token: string | undefined, nowMs = Date.now()): void {
    sessions.clearPublicSession(this.ctx, token, nowMs);
  }

  readPublicAccount(wallet: string, nowMs = Date.now()): PublicAccountEntry | undefined {
    return sessions.readPublicAccount(this.ctx, wallet, nowMs);
  }

  ensurePublicAccount(wallet: string, nowMs = Date.now()): PublicAccountEntry {
    return sessions.ensurePublicAccount(this.ctx, wallet, nowMs);
  }

  listBuyerApiKeys(wallet: string, nowMs = Date.now()): BuyerApiKeyEntry[] {
    return buyerLedger.listBuyerApiKeys(this.ctx, wallet, nowMs);
  }

  createBuyerApiKey(input: {
    wallet: string;
    name: string;
    keyHash: string;
    prefix: string;
    spendLimitUsd?: number;
  }): BuyerApiKeyEntry {
    return buyerLedger.createBuyerApiKey(this.ctx, input);
  }

  revokeBuyerApiKey(wallet: string, keyId: string, nowMs = Date.now()): boolean {
    return buyerLedger.revokeBuyerApiKey(this.ctx, wallet, keyId, nowMs);
  }

  readActiveBuyerApiKeyByHash(keyHash: string, nowMs = Date.now()): BuyerApiKeyEntry | undefined {
    return buyerLedger.readActiveBuyerApiKeyByHash(this.ctx, keyHash, nowMs);
  }

  recordBuyerApiKeyUsage(keyId: string, costUsd: number, nowMs = Date.now()): void {
    buyerLedger.recordBuyerApiKeyUsage(this.ctx, keyId, costUsd, nowMs);
  }

  linkSellerProvider(wallet: string, providerId: string, nowMs = Date.now()): PublicAccountEntry {
    return sellerLedger.linkSellerProvider(this.ctx, wallet, providerId, nowMs);
  }

  sellerOwnsProvider(wallet: string, providerId: string, nowMs = Date.now()): boolean {
    return sellerLedger.sellerOwnsProvider(this.ctx, wallet, providerId, nowMs);
  }

  creditBuyerBalance(wallet: string, amountUsd: number, nowMs = Date.now()): PublicAccountEntry {
    return buyerLedger.creditBuyerBalance(this.ctx, wallet, amountUsd, nowMs);
  }

  debitBuyerBalance(wallet: string, amountUsd: number, nowMs = Date.now()): boolean {
    return buyerLedger.debitBuyerBalance(this.ctx, wallet, amountUsd, nowMs);
  }

  recordBuyerPurchase(
    input: Omit<BuyerPurchaseEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): BuyerPurchaseEntry {
    return buyerLedger.recordBuyerPurchase(this.ctx, input);
  }

  listBuyerPurchases(
    wallet: string,
    limit = DEFAULTS.BUYER_PURCHASE_LIST_LIMIT,
    nowMs = Date.now()
  ): BuyerPurchaseEntry[] {
    return buyerLedger.listBuyerPurchases(this.ctx, wallet, limit, nowMs);
  }

  recordSellerPayout(
    input: Omit<SellerPayoutEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): SellerPayoutEntry {
    return sellerLedger.recordSellerPayout(this.ctx, input);
  }

  listSellerPayouts(
    providerIds: string[],
    limit = DEFAULTS.SELLER_PAYOUT_LIST_LIMIT,
    nowMs = Date.now()
  ): SellerPayoutEntry[] {
    return sellerLedger.listSellerPayouts(this.ctx, providerIds, limit, nowMs);
  }

  getSellerStats(
    providerIds: string[],
    nowMs = Date.now()
  ): {
    grossUsd: number;
    payoutCount: number;
    routedRequests24h: number;
    earnings24hUsd: number;
    payouts: SellerPayoutEntry[];
  } {
    return sellerLedger.getSellerStats(this.ctx, providerIds, nowMs);
  }

  consumeRateLimit(
    bucket: string,
    key: string,
    maxRequests: number,
    windowMs: number,
    nowMs = Date.now()
  ): { allowed: true } | { allowed: false; retryAfterSec: number } {
    return rateLimits.consumeRateLimit(this.ctx, bucket, key, maxRequests, windowMs, nowMs);
  }

  readRuntimeSettings(nowMs = Date.now()): ApiRuntimeSettings {
    return sessions.readRuntimeSettings(this.ctx, nowMs);
  }

  readX402Enabled(nowMs = Date.now()): boolean {
    return sessions.readX402Enabled(this.ctx, nowMs);
  }

  setX402Enabled(enabled: boolean, nowMs = Date.now()): ApiRuntimeSettings {
    return sessions.setX402Enabled(this.ctx, enabled, nowMs);
  }

  ensureRuntimeSettingsSeeded(env: NodeJS.ProcessEnv, nowMs = Date.now()): ApiRuntimeSettings {
    return sessions.ensureRuntimeSettingsSeeded(this.ctx, env, nowMs);
  }

  upsertSellerUpstreamConfig(
    wallet: string,
    provider: import('@bossraid/constants').UpstreamProviderId,
    apiKey: string,
    env: NodeJS.ProcessEnv = process.env,
    nowMs = Date.now()
  ): SellerUpstreamConfigEntry {
    return sellerUpstream.upsertSellerUpstreamConfig(
      this.ctx,
      { wallet, provider, apiKey, cipher: createSecretCipher(env) },
      nowMs
    );
  }

  readSellerUpstreamConfig(
    wallet: string,
    provider: import('@bossraid/constants').UpstreamProviderId,
    nowMs = Date.now()
  ): SellerUpstreamConfigEntry | undefined {
    return sellerUpstream.readSellerUpstreamConfig(this.ctx, wallet, provider, nowMs);
  }

  listSellerUpstreamConfigs(wallet: string, nowMs = Date.now()): SellerUpstreamConfigEntry[] {
    return sellerUpstream.listSellerUpstreamConfigs(this.ctx, wallet, nowMs);
  }

  readSellerUpstreamApiKey(
    wallet: string,
    provider: import('@bossraid/constants').UpstreamProviderId,
    env: NodeJS.ProcessEnv = process.env,
    nowMs = Date.now()
  ): string | undefined {
    return sellerUpstream.readSellerUpstreamApiKey(
      this.ctx,
      wallet,
      provider,
      createSecretCipher(env),
      nowMs
    );
  }

  deleteSellerUpstreamConfig(
    wallet: string,
    provider: import('@bossraid/constants').UpstreamProviderId,
    nowMs = Date.now()
  ): boolean {
    return sellerUpstream.deleteSellerUpstreamConfig(this.ctx, wallet, provider, nowMs);
  }

  upsertSellerVeniceConfig(
    wallet: string,
    apiKey: string,
    env: NodeJS.ProcessEnv = process.env,
    nowMs = Date.now()
  ): SellerUpstreamConfigEntry {
    return this.upsertSellerUpstreamConfig(wallet, 'venice', apiKey, env, nowMs);
  }

  readSellerVeniceConfig(
    wallet: string,
    nowMs = Date.now()
  ): SellerUpstreamConfigEntry | undefined {
    return this.readSellerUpstreamConfig(wallet, 'venice', nowMs);
  }

  readSellerVeniceApiKey(
    wallet: string,
    env: NodeJS.ProcessEnv = process.env,
    nowMs = Date.now()
  ): string | undefined {
    return this.readSellerUpstreamApiKey(wallet, 'venice', env, nowMs);
  }

  deleteSellerVeniceConfig(wallet: string, nowMs = Date.now()): boolean {
    return this.deleteSellerUpstreamConfig(wallet, 'venice', nowMs);
  }
}

export function createApiControlState(env: NodeJS.ProcessEnv = process.env): ApiControlState {
  const controlState = new ApiControlState(createApiControlStateStore(env));
  controlState.ensureRuntimeSettingsSeeded(env);
  return controlState;
}
