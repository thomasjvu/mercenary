import assert from 'node:assert/strict';
import test from 'node:test';
import type { Address, Hex } from 'viem';
import type { ApiContext } from '../api-context.js';
import { createApiControlState } from '../control-state.js';
import { usdToAtomicUsdg } from './x402-settle-verify.js';
import {
  flushSellerTreasuryPayout,
  type TreasuryTransferClients,
} from './seller-treasury-flush.js';

const SELLER_WALLET = '0x1111111111111111111111111111111111111111';
const PROVIDER_ID = 'provider_test_flush';

function makeCtx(envOverrides: Record<string, string | undefined> = {}) {
  const env = {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD: '1',
    NODE_ENV: 'test',
    ...envOverrides,
  };
  const controlState = createApiControlState(env);
  controlState.linkSellerProvider(SELLER_WALLET, PROVIDER_ID);
  const ctx = {
    controlState,
    env,
  } as unknown as ApiContext;
  return { ctx, controlState, env };
}

function accrue(
  controlState: ReturnType<typeof createApiControlState>,
  count: number,
  grossUsd: number,
  idPrefix = 'payout'
) {
  for (let i = 0; i < count; i += 1) {
    controlState.recordSellerPayout({
      id: `${idPrefix}_${i}`,
      providerId: PROVIDER_ID,
      raidId: `raid_${idPrefix}_${i}`,
      grossUsd,
      status: 'accrued',
    });
  }
}

function mockTransferClients(options?: {
  balance?: bigint;
  failTransfer?: boolean;
  onTransfer?: (amount: bigint) => void;
}): TreasuryTransferClients & { transferCount: number; amounts: bigint[] } {
  const state = { transferCount: 0, amounts: [] as bigint[] };
  return {
    get transferCount() {
      return state.transferCount;
    },
    get amounts() {
      return state.amounts;
    },
    async readBalance() {
      return options?.balance ?? 10n ** 18n;
    },
    async transfer(input: { token: Address; to: Address; amount: bigint }) {
      state.transferCount += 1;
      state.amounts.push(input.amount);
      options?.onTransfer?.(input.amount);
      if (options?.failTransfer) {
        throw new Error('mock transfer failed');
      }
      return `0x${state.transferCount.toString(16).padStart(64, '0')}` as Hex;
    },
    async waitForReceipt() {
      // no-op
    },
  };
}

test('flush not eligible below floor', async () => {
  const { ctx, controlState } = makeCtx();
  accrue(controlState, 1, 0.5);

  const result = await flushSellerTreasuryPayout({
    ctx,
    providerIds: [PROVIDER_ID],
    sellerPayoutWallet: SELLER_WALLET,
    allowLedgerOnly: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, 'flush_not_eligible');
  }
  const stats = controlState.getSellerStats([PROVIDER_ID]);
  assert.equal(stats.pendingUsd, 0.5);
  assert.equal(stats.payouts[0]?.status, 'accrued');
});

test('claim + onchain success path with mocked transfer clients', async () => {
  const { ctx, controlState } = makeCtx({
    BOSSRAID_RPC_URL: 'https://rpc.test',
    BOSSRAID_SETTLEMENT_TREASURY_KEY:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  });
  accrue(controlState, 2, 1.25);
  const clients = mockTransferClients();
  const expectedAtomic = usdToAtomicUsdg(2.5);

  const result = await flushSellerTreasuryPayout({
    ctx,
    providerIds: [PROVIDER_ID],
    sellerPayoutWallet: SELLER_WALLET,
    transferClients: clients,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mode, 'onchain');
    assert.equal(result.flushedCount, 2);
    assert.equal(result.flushedUsd, 2.5);
    assert.ok(result.txHash);
  }
  assert.equal(clients.transferCount, 1);
  assert.equal(clients.amounts[0], expectedAtomic);

  const stats = controlState.getSellerStats([PROVIDER_ID]);
  assert.equal(stats.pendingUsd, 0);
  assert.equal(stats.settledUsd, 2.5);
  assert.ok(stats.payouts.every((p) => p.status === 'settled' && p.txHash));
});

test('concurrent double flush: second does not transfer twice', async () => {
  const { ctx, controlState } = makeCtx({
    BOSSRAID_RPC_URL: 'https://rpc.test',
    BOSSRAID_SETTLEMENT_TREASURY_KEY:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  });
  accrue(controlState, 1, 5);
  const clients = mockTransferClients();

  const [first, second] = await Promise.all([
    flushSellerTreasuryPayout({
      ctx,
      providerIds: [PROVIDER_ID],
      sellerPayoutWallet: SELLER_WALLET,
      transferClients: clients,
    }),
    flushSellerTreasuryPayout({
      ctx,
      providerIds: [PROVIDER_ID],
      sellerPayoutWallet: SELLER_WALLET,
      transferClients: clients,
    }),
  ]);

  const successes = [first, second].filter((r) => r.ok);
  const failures = [first, second].filter((r) => !r.ok);
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  if (!failures[0]!.ok) {
    assert.equal(failures[0]!.error, 'flush_not_eligible');
  }
  assert.equal(clients.transferCount, 1);

  const stats = controlState.getSellerStats([PROVIDER_ID]);
  assert.equal(stats.pendingUsd, 0);
  assert.equal(stats.settledUsd, 5);
});

test('more than 500 accrued rows: amount and mark counts match full sum', async () => {
  const { ctx, controlState } = makeCtx({
    BOSSRAID_RPC_URL: 'https://rpc.test',
    BOSSRAID_SETTLEMENT_TREASURY_KEY:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  });
  const rowCount = 501;
  // Integer cents avoid IEEE float drift on 501 * 0.01.
  const perRow = 0.02;
  accrue(controlState, rowCount, perRow);
  const clients = mockTransferClients();

  const statsBefore = controlState.getSellerStats([PROVIDER_ID]);
  const expectedUsd = statsBefore.pendingUsd;
  assert.ok(expectedUsd > 500 * perRow);
  assert.equal(statsBefore.flushEligible, true);
  // Display list stays capped; money amounts use full store.
  assert.equal(statsBefore.payouts.length, 500);
  assert.equal(statsBefore.payoutCount, rowCount);

  const result = await flushSellerTreasuryPayout({
    ctx,
    providerIds: [PROVIDER_ID],
    sellerPayoutWallet: SELLER_WALLET,
    transferClients: clients,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.flushedCount, rowCount);
    assert.equal(result.flushedUsd, expectedUsd);
    assert.equal(result.payoutIds.length, rowCount);
  }
  assert.equal(clients.transferCount, 1);
  assert.equal(clients.amounts[0], usdToAtomicUsdg(expectedUsd));

  const statsAfter = controlState.getSellerStats([PROVIDER_ID]);
  assert.equal(statsAfter.pendingUsd, 0);
  assert.equal(statsAfter.settledUsd, expectedUsd);
});

test('production rejects bare client txHash', async () => {
  const { ctx, controlState } = makeCtx({
    NODE_ENV: 'production',
  });
  accrue(controlState, 1, 2);

  const result = await flushSellerTreasuryPayout({
    ctx,
    providerIds: [PROVIDER_ID],
    sellerPayoutWallet: SELLER_WALLET,
    txHashOverride: '0xdeadbeef',
    allowLedgerOnly: false,
    nodeEnv: 'production',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, 'tx_hash_not_allowed');
  }
  const stats = controlState.getSellerStats([PROVIDER_ID]);
  assert.equal(stats.pendingUsd, 2);
  assert.equal(stats.payouts[0]?.status, 'accrued');
});

test('transfer failure releases claim so rows stay accrued', async () => {
  const { ctx, controlState } = makeCtx({
    BOSSRAID_RPC_URL: 'https://rpc.test',
    BOSSRAID_SETTLEMENT_TREASURY_KEY:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  });
  accrue(controlState, 1, 3);
  const clients = mockTransferClients({ failTransfer: true });

  const result = await flushSellerTreasuryPayout({
    ctx,
    providerIds: [PROVIDER_ID],
    sellerPayoutWallet: SELLER_WALLET,
    transferClients: clients,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, 'treasury_transfer_failed');
  }
  const stats = controlState.getSellerStats([PROVIDER_ID]);
  assert.equal(stats.pendingUsd, 3);
  assert.equal(stats.payouts[0]?.status, 'accrued');
  assert.equal(stats.payouts[0]?.flushClaimId, undefined);
});

test('claimSellerPayoutsForFlush second claim is empty', () => {
  const { controlState } = makeCtx();
  accrue(controlState, 1, 2);

  const first = controlState.claimSellerPayoutsForFlush([PROVIDER_ID], { minUsd: 1 });
  assert.equal(first.payoutIds.length, 1);
  assert.equal(first.claimedUsd, 2);

  const second = controlState.claimSellerPayoutsForFlush([PROVIDER_ID], { minUsd: 1 });
  assert.equal(second.payoutIds.length, 0);
  assert.equal(second.claimedUsd, 0);

  controlState.releaseSellerPayoutClaim({
    claimId: first.claimId,
    payoutIds: first.payoutIds,
  });
  const stats = controlState.getSellerStats([PROVIDER_ID]);
  assert.equal(stats.pendingUsd, 2);
});
