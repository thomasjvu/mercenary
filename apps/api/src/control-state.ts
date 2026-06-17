import { DEFAULTS } from '@bossraid/constants';
import { createSecretCipher } from '@bossraid/persistence';
import * as buyerLedger from './control-state/buyer-ledger.js';
import * as rateLimits from './control-state/rate-limits.js';
import * as sellerLedger from './control-state/seller-ledger.js';
import * as sellerUpstream from './control-state/seller-upstream.js';
import * as agentSessions from './control-state/agent-sessions.js';
import * as relayerTasks from './control-state/relayer-tasks.js';
import * as sessions from './control-state/sessions.js';
import { ControlStateContext } from './control-state/state-context.js';
import { createApiControlStateStore } from './control-state/store.js';
import type {
  AgentPaymentSessionEntry,
  ApiControlStateStore,
  ApiOpsSessionEntry,
  ApiRuntimeSettings,
  BuyerApiKeyEntry,
  BuyerPurchaseEntry,
  PublicAccountEntry,
  PublicAuthNonceEntry,
  PublicSessionEntry,
  RelayerTaskEntry,
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

export function createApiControlStateFromStore(store: ApiControlStateStore) {
  const ctx = new ControlStateContext(store);

  return {
    readOpsSession(token: string | undefined, nowMs = Date.now()): ApiOpsSessionEntry | undefined {
      return sessions.readOpsSession(ctx, token, nowMs);
    },

    issueOpsSession(ttlSec: number, nowMs = Date.now()): ApiOpsSessionEntry {
      return sessions.issueOpsSession(ctx, ttlSec, nowMs);
    },

    clearOpsSession(token: string | undefined, nowMs = Date.now()): void {
      sessions.clearOpsSession(ctx, token, nowMs);
    },

    createPublicAuthNonce(
      wallet: string | undefined,
      ttlSec: number,
      nowMs = Date.now()
    ): PublicAuthNonceEntry {
      return sessions.createPublicAuthNonce(ctx, wallet, ttlSec, nowMs);
    },

    consumePublicAuthNonce(
      nonce: string,
      wallet: string | undefined,
      nowMs = Date.now()
    ): PublicAuthNonceEntry | undefined {
      return sessions.consumePublicAuthNonce(ctx, nonce, wallet, nowMs);
    },

    issuePublicSession(wallet: string, ttlSec: number, nowMs = Date.now()): PublicSessionEntry {
      return sessions.issuePublicSession(ctx, wallet, ttlSec, nowMs);
    },

    readPublicSession(
      token: string | undefined,
      nowMs = Date.now()
    ): PublicSessionEntry | undefined {
      return sessions.readPublicSession(ctx, token, nowMs);
    },

    clearPublicSession(token: string | undefined, nowMs = Date.now()): void {
      sessions.clearPublicSession(ctx, token, nowMs);
    },

    readPublicAccount(wallet: string, nowMs = Date.now()): PublicAccountEntry | undefined {
      return sessions.readPublicAccount(ctx, wallet, nowMs);
    },

    ensurePublicAccount(wallet: string, nowMs = Date.now()): PublicAccountEntry {
      return sessions.ensurePublicAccount(ctx, wallet, nowMs);
    },

    listBuyerApiKeys(wallet: string, nowMs = Date.now()): BuyerApiKeyEntry[] {
      return buyerLedger.listBuyerApiKeys(ctx, wallet, nowMs);
    },

    createBuyerApiKey(input: {
      wallet: string;
      name: string;
      keyHash: string;
      prefix: string;
      spendLimitUsd?: number;
    }): BuyerApiKeyEntry {
      return buyerLedger.createBuyerApiKey(ctx, input);
    },

    updateBuyerApiKeySpendLimit(
      wallet: string,
      keyId: string,
      spendLimitUsd: number,
      nowMs = Date.now()
    ): BuyerApiKeyEntry | undefined {
      return buyerLedger.updateBuyerApiKeySpendLimit(ctx, wallet, keyId, spendLimitUsd, nowMs);
    },

    revokeBuyerApiKey(wallet: string, keyId: string, nowMs = Date.now()): boolean {
      return buyerLedger.revokeBuyerApiKey(ctx, wallet, keyId, nowMs);
    },

    readActiveBuyerApiKeyByHash(keyHash: string, nowMs = Date.now()): BuyerApiKeyEntry | undefined {
      return buyerLedger.readActiveBuyerApiKeyByHash(ctx, keyHash, nowMs);
    },

    recordBuyerApiKeyUsage(keyId: string, costUsd: number, nowMs = Date.now()): void {
      buyerLedger.recordBuyerApiKeyUsage(ctx, keyId, costUsd, nowMs);
    },

    linkSellerProvider(wallet: string, providerId: string, nowMs = Date.now()): PublicAccountEntry {
      return sellerLedger.linkSellerProvider(ctx, wallet, providerId, nowMs);
    },

    sellerOwnsProvider(wallet: string, providerId: string, nowMs = Date.now()): boolean {
      return sellerLedger.sellerOwnsProvider(ctx, wallet, providerId, nowMs);
    },

    creditBuyerBalance(wallet: string, amountUsd: number, nowMs = Date.now()): PublicAccountEntry {
      return buyerLedger.creditBuyerBalance(ctx, wallet, amountUsd, nowMs);
    },

    debitBuyerBalance(wallet: string, amountUsd: number, nowMs = Date.now()): boolean {
      return buyerLedger.debitBuyerBalance(ctx, wallet, amountUsd, nowMs);
    },

    recordBuyerPurchase(
      input: Omit<BuyerPurchaseEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
    ): BuyerPurchaseEntry {
      return buyerLedger.recordBuyerPurchase(ctx, input);
    },

    listBuyerPurchases(
      wallet: string,
      limit = DEFAULTS.BUYER_PURCHASE_LIST_LIMIT,
      nowMs = Date.now()
    ): BuyerPurchaseEntry[] {
      return buyerLedger.listBuyerPurchases(ctx, wallet, limit, nowMs);
    },

    recordSellerPayout(
      input: Omit<SellerPayoutEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
    ): SellerPayoutEntry {
      return sellerLedger.recordSellerPayout(ctx, input);
    },

    listSellerPayouts(
      providerIds: string[],
      limit = DEFAULTS.SELLER_PAYOUT_LIST_LIMIT,
      nowMs = Date.now()
    ): SellerPayoutEntry[] {
      return sellerLedger.listSellerPayouts(ctx, providerIds, limit, nowMs);
    },

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
      return sellerLedger.getSellerStats(ctx, providerIds, nowMs);
    },

    consumeRateLimit(
      bucket: string,
      key: string,
      maxRequests: number,
      windowMs: number,
      nowMs = Date.now()
    ): { allowed: true } | { allowed: false; retryAfterSec: number } {
      return rateLimits.consumeRateLimit(ctx, bucket, key, maxRequests, windowMs, nowMs);
    },

    readRuntimeSettings(nowMs = Date.now()): ApiRuntimeSettings {
      return sessions.readRuntimeSettings(ctx, nowMs);
    },

    readX402Enabled(nowMs = Date.now()): boolean {
      return sessions.readX402Enabled(ctx, nowMs);
    },

    setX402Enabled(enabled: boolean, nowMs = Date.now()): ApiRuntimeSettings {
      return sessions.setX402Enabled(ctx, enabled, nowMs);
    },

    ensureRuntimeSettingsSeeded(env: NodeJS.ProcessEnv, nowMs = Date.now()): ApiRuntimeSettings {
      return sessions.ensureRuntimeSettingsSeeded(ctx, env, nowMs);
    },

    upsertSellerUpstreamConfig(
      wallet: string,
      provider: import('@bossraid/constants').UpstreamProviderId,
      apiKey: string,
      env: NodeJS.ProcessEnv = process.env,
      nowMs = Date.now()
    ): SellerUpstreamConfigEntry {
      return sellerUpstream.upsertSellerUpstreamConfig(
        ctx,
        { wallet, provider, apiKey, cipher: createSecretCipher(env) },
        nowMs
      );
    },

    readSellerUpstreamConfig(
      wallet: string,
      provider: import('@bossraid/constants').UpstreamProviderId,
      nowMs = Date.now()
    ): SellerUpstreamConfigEntry | undefined {
      return sellerUpstream.readSellerUpstreamConfig(ctx, wallet, provider, nowMs);
    },

    listSellerUpstreamConfigs(wallet: string, nowMs = Date.now()): SellerUpstreamConfigEntry[] {
      return sellerUpstream.listSellerUpstreamConfigs(ctx, wallet, nowMs);
    },

    readSellerUpstreamApiKey(
      wallet: string,
      provider: import('@bossraid/constants').UpstreamProviderId,
      env: NodeJS.ProcessEnv = process.env,
      nowMs = Date.now()
    ): string | undefined {
      return sellerUpstream.readSellerUpstreamApiKey(
        ctx,
        wallet,
        provider,
        createSecretCipher(env),
        nowMs
      );
    },

    deleteSellerUpstreamConfig(
      wallet: string,
      provider: import('@bossraid/constants').UpstreamProviderId,
      nowMs = Date.now()
    ): boolean {
      return sellerUpstream.deleteSellerUpstreamConfig(ctx, wallet, provider, nowMs);
    },

    upsertAgentPaymentSession(entry: AgentPaymentSessionEntry): AgentPaymentSessionEntry {
      return agentSessions.upsertAgentPaymentSession(ctx, entry);
    },

    getAgentPaymentSession(wallet: string): AgentPaymentSessionEntry | undefined {
      return agentSessions.getAgentPaymentSession(ctx, wallet);
    },

    deleteAgentPaymentSession(wallet: string): void {
      agentSessions.deleteAgentPaymentSession(ctx, wallet);
    },

    upsertRelayerTask(entry: RelayerTaskEntry): RelayerTaskEntry {
      return relayerTasks.upsertRelayerTask(ctx, entry);
    },

    getRelayerTask(taskId: string): RelayerTaskEntry | undefined {
      return relayerTasks.getRelayerTask(ctx, taskId);
    },
  };
}

export type ApiControlState = ReturnType<typeof createApiControlStateFromStore>;

export function createApiControlState(env: NodeJS.ProcessEnv = process.env): ApiControlState {
  const controlState = createApiControlStateFromStore(createApiControlStateStore(env));
  controlState.ensureRuntimeSettingsSeeded(env);
  return controlState;
}
