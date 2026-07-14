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
  const { snapshot } = ctx.readPrunedState(nowMs);
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
  const { snapshot } = ctx.readPrunedState(nowMs);
  const key = snapshot.buyerApiKeys.find(
    (item) => item.keyHash === keyHash && item.status === 'active'
  );
  return key ? structuredClone(key) : undefined;
}

export type BuyerApiKeyLaunchReservation = {
  apiKeyId: string;
  wallet: string;
  reservedUsd: number;
  useBalance: boolean;
};

export function reserveBuyerApiKeyLaunch(
  ctx: ControlStateContext,
  apiKeyId: string,
  wallet: string,
  amountUsd: number,
  nowMs = Date.now()
): BuyerApiKeyLaunchReservation | undefined {
  let reservation: BuyerApiKeyLaunchReservation | undefined;
  ctx.mutateState((snapshot) => {
    const key = snapshot.buyerApiKeys.find(
      (item) => item.id === apiKeyId && item.status === 'active'
    );
    if (!key) {
      return;
    }

    const normalizedWallet = wallet.toLowerCase();
    const account = ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
    const charge = Math.max(0, amountUsd);
    const spendCapOk = key.spendLimitUsd == null || key.spentUsd + charge <= key.spendLimitUsd;
    if (!spendCapOk) {
      return;
    }

    // Always require prepaid balance — never reserve "spend-cap only" free capacity.
    if (account.balanceUsd < charge) {
      return;
    }

    key.spentUsd += charge;
    key.lastUsedAt = new Date(nowMs).toISOString();
    account.balanceUsd -= charge;
    account.updatedAt = new Date(nowMs).toISOString();
    reservation = {
      apiKeyId,
      wallet: normalizedWallet,
      reservedUsd: charge,
      useBalance: true,
    };
  }, nowMs);
  return reservation;
}

export function releaseBuyerApiKeyReservation(
  ctx: ControlStateContext,
  reservation: BuyerApiKeyLaunchReservation,
  nowMs = Date.now()
): void {
  ctx.mutateState((snapshot) => {
    const key = snapshot.buyerApiKeys.find((item) => item.id === reservation.apiKeyId);
    if (key) {
      key.spentUsd = Math.max(0, key.spentUsd - reservation.reservedUsd);
    }
    if (reservation.useBalance) {
      const account = ensurePublicAccountInSnapshot(snapshot, reservation.wallet);
      account.balanceUsd += reservation.reservedUsd;
      account.updatedAt = new Date(nowMs).toISOString();
    }
  }, nowMs);
}

export function captureBuyerApiKeyBillingWithPurchase(
  ctx: ControlStateContext,
  reservation: BuyerApiKeyLaunchReservation,
  input: {
    actualCostUsd: number;
    raidId: string;
    modelId?: string;
    sellerId?: string;
    route: BuyerPurchaseEntry['route'];
    benchmarkPriceUsd?: number;
    savingsUsd?: number;
  },
  nowMs = Date.now()
): boolean {
  try {
    ctx.mutateState((snapshot) => {
      const key = snapshot.buyerApiKeys.find((item) => item.id === reservation.apiKeyId);
      if (!key) {
        throw new Error('buyer_api_key_missing');
      }

      const actual = Math.max(0, input.actualCostUsd);
      const delta = reservation.reservedUsd - actual;
      if (delta > 0) {
        key.spentUsd = Math.max(0, key.spentUsd - delta);
        if (reservation.useBalance) {
          const account = ensurePublicAccountInSnapshot(snapshot, reservation.wallet);
          account.balanceUsd += delta;
          account.updatedAt = new Date(nowMs).toISOString();
        }
      } else if (delta < 0) {
        const extra = -delta;
        if (key.spendLimitUsd != null && key.spentUsd + extra > key.spendLimitUsd) {
          throw new Error('buyer_api_key_spend_cap_exceeded');
        }
        key.spentUsd += extra;
        if (reservation.useBalance) {
          const account = ensurePublicAccountInSnapshot(snapshot, reservation.wallet);
          if (account.balanceUsd < extra) {
            throw new Error('buyer_balance_insufficient');
          }
          account.balanceUsd -= extra;
          account.updatedAt = new Date(nowMs).toISOString();
        }
      }

      const entry: BuyerPurchaseEntry = {
        id: `purchase_${randomUUID()}`,
        wallet: reservation.wallet,
        apiKeyId: reservation.apiKeyId,
        raidId: input.raidId,
        modelId: input.modelId,
        sellerId: input.sellerId,
        costUsd: actual,
        benchmarkPriceUsd: input.benchmarkPriceUsd,
        savingsUsd: input.savingsUsd,
        route: input.route,
        createdAt: new Date(nowMs).toISOString(),
      };
      snapshot.buyerPurchases.unshift(entry);
      snapshot.buyerPurchases = snapshot.buyerPurchases.slice(0, 5_000);
    }, nowMs);
    return true;
  } catch {
    return false;
  }
}

export function finalizeBuyerApiKeyBilling(
  ctx: ControlStateContext,
  reservation: BuyerApiKeyLaunchReservation,
  actualCostUsd: number,
  nowMs = Date.now()
): boolean {
  let finalized = false;
  try {
    ctx.mutateState((snapshot) => {
      const key = snapshot.buyerApiKeys.find((item) => item.id === reservation.apiKeyId);
      if (!key) {
        throw new Error('buyer_api_key_missing');
      }

      const actual = Math.max(0, actualCostUsd);
      const delta = reservation.reservedUsd - actual;
      if (delta > 0) {
        key.spentUsd = Math.max(0, key.spentUsd - delta);
        if (reservation.useBalance) {
          const account = ensurePublicAccountInSnapshot(snapshot, reservation.wallet);
          account.balanceUsd += delta;
          account.updatedAt = new Date(nowMs).toISOString();
        }
      } else if (delta < 0) {
        const extra = -delta;
        if (key.spendLimitUsd != null && key.spentUsd + extra > key.spendLimitUsd) {
          throw new Error('buyer_api_key_spend_cap_exceeded');
        }
        key.spentUsd += extra;
        if (reservation.useBalance) {
          const account = ensurePublicAccountInSnapshot(snapshot, reservation.wallet);
          if (account.balanceUsd < extra) {
            throw new Error('buyer_balance_insufficient');
          }
          account.balanceUsd -= extra;
          account.updatedAt = new Date(nowMs).toISOString();
        }
      }
      finalized = true;
    }, nowMs);
  } catch {
    return false;
  }
  return finalized;
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
  let account: PublicAccountEntry | undefined;
  ctx.mutateState((snapshot) => {
    const entry = ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
    entry.balanceUsd += Math.max(0, amountUsd);
    entry.updatedAt = new Date(nowMs).toISOString();
    account = structuredClone(entry);
  }, nowMs);
  return account!;
}

export function debitBuyerBalance(
  ctx: ControlStateContext,
  wallet: string,
  amountUsd: number,
  nowMs = Date.now()
): boolean {
  const normalizedWallet = wallet.toLowerCase();
  const charge = Math.max(0, amountUsd);
  let debited = false;
  try {
    ctx.mutateState((snapshot) => {
      const account = ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
      if (account.balanceUsd < charge) {
        throw new Error('buyer_balance_insufficient');
      }
      account.balanceUsd -= charge;
      account.updatedAt = new Date(nowMs).toISOString();
      debited = true;
    }, nowMs);
  } catch {
    return false;
  }
  return debited;
}

export function recordBuyerPurchase(
  ctx: ControlStateContext,
  input: Omit<BuyerPurchaseEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): BuyerPurchaseEntry {
  const nowMs = Date.now();
  let recorded: BuyerPurchaseEntry | undefined;
  ctx.mutateState((snapshot) => {
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
      createdAt: input.createdAt ?? new Date(nowMs).toISOString(),
    };
    snapshot.buyerPurchases.unshift(entry);
    snapshot.buyerPurchases = snapshot.buyerPurchases.slice(0, 5_000);
    recorded = structuredClone(entry);
  }, nowMs);
  return recorded!;
}

export function listBuyerPurchases(
  ctx: ControlStateContext,
  wallet: string,
  limit = DEFAULTS.BUYER_PURCHASE_LIST_LIMIT,
  nowMs = Date.now()
): BuyerPurchaseEntry[] {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  return snapshot.buyerPurchases
    .filter((entry) => entry.wallet === normalizedWallet)
    .slice(0, Math.max(1, limit))
    .map((entry) => structuredClone(entry));
}
