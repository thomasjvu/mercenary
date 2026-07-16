import { DEFAULTS } from '@bossraid/constants';
import { createSecretCipher } from '@bossraid/persistence';
import * as buyerLedger from './control-state/buyer-ledger.js';
import * as rateLimits from './control-state/rate-limits.js';
import * as sellerLedger from './control-state/seller-ledger.js';
import * as sellerUpstream from './control-state/seller-upstream.js';
import * as agentSessions from './control-state/agent-sessions.js';
import * as relayerTasks from './control-state/relayer-tasks.js';
import * as x402Reconciliations from './control-state/x402-reconciliations.js';
import * as x402SettledPayments from './control-state/x402-settled-payments.js';
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
  X402ReconciliationEntry,
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

    reserveBuyerApiKeyLaunch(
      apiKeyId: string,
      wallet: string,
      amountUsd: number,
      nowMs = Date.now()
    ): buyerLedger.BuyerApiKeyLaunchReservation | undefined {
      return buyerLedger.reserveBuyerApiKeyLaunch(ctx, apiKeyId, wallet, amountUsd, nowMs);
    },

    releaseBuyerApiKeyReservation(
      reservation: buyerLedger.BuyerApiKeyLaunchReservation,
      nowMs = Date.now()
    ): void {
      buyerLedger.releaseBuyerApiKeyReservation(ctx, reservation, nowMs);
    },

    finalizeBuyerApiKeyBilling(
      reservation: buyerLedger.BuyerApiKeyLaunchReservation,
      actualCostUsd: number,
      nowMs = Date.now()
    ): boolean {
      return buyerLedger.finalizeBuyerApiKeyBilling(ctx, reservation, actualCostUsd, nowMs);
    },

    captureBuyerApiKeyBillingWithPurchase(
      reservation: buyerLedger.BuyerApiKeyLaunchReservation,
      input: Parameters<typeof buyerLedger.captureBuyerApiKeyBillingWithPurchase>[2],
      nowMs = Date.now()
    ): boolean {
      return buyerLedger.captureBuyerApiKeyBillingWithPurchase(ctx, reservation, input, nowMs);
    },

    linkSellerProvider(wallet: string, providerId: string, nowMs = Date.now()): PublicAccountEntry {
      return sellerLedger.linkSellerProvider(ctx, wallet, providerId, nowMs);
    },

    sellerOwnsProvider(wallet: string, providerId: string, nowMs = Date.now()): boolean {
      return sellerLedger.sellerOwnsProvider(ctx, wallet, providerId, nowMs);
    },

    findSellerWalletForProvider(providerId: string, nowMs = Date.now()): string | undefined {
      return sellerLedger.findSellerWalletForProvider(ctx, providerId, nowMs);
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
      nowMs = Date.now(),
      flushMinUsd = 1
    ): {
      grossUsd: number;
      payoutCount: number;
      routedRequests24h: number;
      earnings24hUsd: number;
      pendingUsd: number;
      settledUsd: number;
      flushEligible: boolean;
      flushMinUsd: number;
      payouts: SellerPayoutEntry[];
    } {
      return sellerLedger.getSellerStats(ctx, providerIds, nowMs, flushMinUsd);
    },

    flushSellerPayouts(
      providerIds: string[],
      input: { txHash?: string; minUsd?: number } = {},
      nowMs = Date.now()
    ): { flushedCount: number; flushedUsd: number; payoutIds: string[] } {
      return sellerLedger.flushSellerPayouts(ctx, providerIds, input, nowMs);
    },

    claimSellerPayoutsForFlush(
      providerIds: string[],
      input: { minUsd?: number } = {},
      nowMs = Date.now()
    ): sellerLedger.SellerFlushClaim {
      return sellerLedger.claimSellerPayoutsForFlush(ctx, providerIds, input, nowMs);
    },

    settleSellerPayoutClaim(
      claim: { claimId: string; payoutIds: string[] },
      input: { txHash?: string } = {},
      nowMs = Date.now()
    ): { flushedCount: number; flushedUsd: number; payoutIds: string[] } {
      return sellerLedger.settleSellerPayoutClaim(ctx, claim, input, nowMs);
    },

    releaseSellerPayoutClaim(
      claim: { claimId: string; payoutIds: string[] },
      nowMs = Date.now()
    ): { releasedCount: number } {
      return sellerLedger.releaseSellerPayoutClaim(ctx, claim, nowMs);
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
        {
          wallet,
          provider,
          apiKey,
          cipher: createSecretCipher(env),
          requireEncryption:
            env.NODE_ENV === 'production' ||
            (env.BOSSRAID_STORAGE_BACKEND ?? 'sqlite') !== 'memory',
        },
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

    upsertX402Reconciliation(entry: X402ReconciliationEntry): X402ReconciliationEntry {
      return x402Reconciliations.upsertX402Reconciliation(ctx, entry);
    },

    listPendingX402Reconciliations(limit = 25): X402ReconciliationEntry[] {
      return x402Reconciliations.listPendingX402Reconciliations(ctx, limit);
    },

    getX402Reconciliation(id: string): X402ReconciliationEntry | undefined {
      return x402Reconciliations.getX402Reconciliation(ctx, id);
    },

    tryClaimX402Reconciliation(
      entryId: string,
      holderId: string,
      leaseMs?: number,
      nowMs = Date.now()
    ): X402ReconciliationEntry | undefined {
      return x402Reconciliations.tryClaimX402Reconciliation(ctx, entryId, holderId, leaseMs, nowMs);
    },

    hasX402SettledPayment(fingerprint: string): boolean {
      return x402SettledPayments.hasX402SettledPayment(ctx, fingerprint);
    },

    recordX402SettledPayment(
      entry: x402SettledPayments.X402SettledPaymentEntry
    ): x402SettledPayments.X402SettledPaymentEntry {
      return x402SettledPayments.recordX402SettledPayment(ctx, entry);
    },

    tryClaimX402SettledPayment(entry: x402SettledPayments.X402SettledPaymentEntry): boolean {
      return x402SettledPayments.tryClaimX402SettledPayment(ctx, entry);
    },

    tryClaimX402SettledPaymentDetailed(
      entry: x402SettledPayments.X402SettledPaymentEntry,
      nowMs = Date.now()
    ): x402SettledPayments.ClaimX402SettledPaymentResult {
      return x402SettledPayments.tryClaimX402SettledPaymentDetailed(ctx, entry, nowMs);
    },

    tryClaimX402SettledPaymentAndCredit(
      entry: x402SettledPayments.X402SettledPaymentEntry,
      nowMs = Date.now()
    ): ReturnType<typeof x402SettledPayments.tryClaimX402SettledPaymentAndCredit> {
      return x402SettledPayments.tryClaimX402SettledPaymentAndCredit(ctx, entry, nowMs);
    },

    releaseX402SettledPayment(fingerprint: string): void {
      x402SettledPayments.releaseX402SettledPayment(ctx, fingerprint);
    },
  };
}

export type ApiControlState = ReturnType<typeof createApiControlStateFromStore>;

export function createApiControlState(env: NodeJS.ProcessEnv = process.env): ApiControlState {
  const controlState = createApiControlStateFromStore(createApiControlStateStore(env));
  controlState.ensureRuntimeSettingsSeeded(env);
  return controlState;
}
