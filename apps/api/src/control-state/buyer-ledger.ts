import { randomUUID } from 'node:crypto';
import { DEFAULTS } from '@bossraid/constants';
import { ensurePublicAccountInSnapshot } from './sessions.js';
import type { ControlStateContext } from './state-context.js';
import type { BuyerApiKeyEntry, BuyerPurchaseEntry, PublicAccountEntry } from './types.js';

export function listBuyerApiKeys(
  ctx: ControlStateContext,
  wallet: string,
  nowMs = Date.now()
): BuyerApiKeyEntry[] {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot, changed } = ctx.readPrunedState(nowMs);
  if (changed) {
    ctx.writeState(snapshot);
  }
  return snapshot.buyerApiKeys
    .filter((key) => key.wallet === normalizedWallet)
    .map((key) => structuredClone(key));
}

export function createBuyerApiKey(
  ctx: ControlStateContext,
  input: {
    wallet: string;
    name: string;
    keyHash: string;
    prefix: string;
    spendLimitUsd?: number;
  }
): BuyerApiKeyEntry {
  const { snapshot } = ctx.readPrunedState(Date.now());
  const wallet = input.wallet.toLowerCase();
  ensurePublicAccountInSnapshot(snapshot, wallet);
  const now = new Date().toISOString();
  const key: BuyerApiKeyEntry = {
    id: `key_${randomUUID()}`,
    wallet,
    name: input.name,
    keyHash: input.keyHash,
    prefix: input.prefix,
    createdAt: now,
    spendLimitUsd: input.spendLimitUsd,
    spentUsd: 0,
    status: 'active',
  };
  snapshot.buyerApiKeys.push(key);
  ctx.writeState(snapshot);
  return structuredClone(key);
}

export function updateBuyerApiKeySpendLimit(
  ctx: ControlStateContext,
  wallet: string,
  keyId: string,
  spendLimitUsd: number,
  nowMs = Date.now()
): BuyerApiKeyEntry | undefined {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const key = snapshot.buyerApiKeys.find(
    (item) => item.wallet === normalizedWallet && item.id === keyId && item.status === 'active'
  );
  if (!key) {
    return undefined;
  }

  key.spendLimitUsd = spendLimitUsd;
  ctx.writeState(snapshot);
  return structuredClone(key);
}

export function revokeBuyerApiKey(
  ctx: ControlStateContext,
  wallet: string,
  keyId: string,
  nowMs = Date.now()
): boolean {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const key = snapshot.buyerApiKeys.find(
    (item) => item.wallet === normalizedWallet && item.id === keyId
  );
  if (!key) {
    return false;
  }
  key.status = 'revoked';
  ctx.writeState(snapshot);
  return true;
}

export function readActiveBuyerApiKeyByHash(
  ctx: ControlStateContext,
  keyHash: string,
  nowMs = Date.now()
): BuyerApiKeyEntry | undefined {
  const { snapshot, changed } = ctx.readPrunedState(nowMs);
  const key = snapshot.buyerApiKeys.find(
    (item) => item.keyHash === keyHash && item.status === 'active'
  );
  if (changed) {
    ctx.writeState(snapshot);
  }
  return key ? structuredClone(key) : undefined;
}

export function recordBuyerApiKeyUsage(
  ctx: ControlStateContext,
  keyId: string,
  costUsd: number,
  nowMs = Date.now()
): void {
  const { snapshot } = ctx.readPrunedState(nowMs);
  const key = snapshot.buyerApiKeys.find((item) => item.id === keyId);
  if (!key) {
    return;
  }
  key.spentUsd += Math.max(0, costUsd);
  key.lastUsedAt = new Date(nowMs).toISOString();
  ctx.writeState(snapshot);
}

export function creditBuyerBalance(
  ctx: ControlStateContext,
  wallet: string,
  amountUsd: number,
  nowMs = Date.now()
): PublicAccountEntry {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const account = ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
  account.balanceUsd += Math.max(0, amountUsd);
  account.updatedAt = new Date(nowMs).toISOString();
  ctx.writeState(snapshot);
  return structuredClone(account);
}

export function debitBuyerBalance(
  ctx: ControlStateContext,
  wallet: string,
  amountUsd: number,
  nowMs = Date.now()
): boolean {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const account = ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
  const charge = Math.max(0, amountUsd);
  if (account.balanceUsd < charge) {
    return false;
  }
  account.balanceUsd -= charge;
  account.updatedAt = new Date(nowMs).toISOString();
  ctx.writeState(snapshot);
  return true;
}

export function recordBuyerPurchase(
  ctx: ControlStateContext,
  input: Omit<BuyerPurchaseEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): BuyerPurchaseEntry {
  const { snapshot } = ctx.readPrunedState(Date.now());
  const entry: BuyerPurchaseEntry = {
    id: input.id ?? `purchase_${randomUUID()}`,
    wallet: input.wallet.toLowerCase(),
    apiKeyId: input.apiKeyId,
    raidId: input.raidId,
    modelId: input.modelId,
    sellerId: input.sellerId,
    costUsd: Math.max(0, input.costUsd),
    benchmarkPriceUsd: input.benchmarkPriceUsd,
    savingsUsd: input.savingsUsd,
    route: input.route,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  snapshot.buyerPurchases.unshift(entry);
  snapshot.buyerPurchases = snapshot.buyerPurchases.slice(0, 5_000);
  ctx.writeState(snapshot);
  return structuredClone(entry);
}

export function listBuyerPurchases(
  ctx: ControlStateContext,
  wallet: string,
  limit = DEFAULTS.BUYER_PURCHASE_LIST_LIMIT,
  nowMs = Date.now()
): BuyerPurchaseEntry[] {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot, changed } = ctx.readPrunedState(nowMs);
  if (changed) {
    ctx.writeState(snapshot);
  }
  return snapshot.buyerPurchases
    .filter((entry) => entry.wallet === normalizedWallet)
    .slice(0, Math.max(1, limit))
    .map((entry) => structuredClone(entry));
}
