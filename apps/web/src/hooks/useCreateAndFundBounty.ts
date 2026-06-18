import { useCallback, useState } from 'react';
import type { CreateBountyInput } from '@bossraid/shared-types';
import { createBounty, fundBounty } from '../api/bounties.js';
import { fetchReady } from '../api/health.js';
import { useSmartAccountPay } from './useSmartAccountPay.js';

type CreateAndFundBountyInput = CreateBountyInput;

export function useCreateAndFundBounty() {
  const smartPay = useSmartAccountPay();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAndFund = useCallback(
    async (input: CreateAndFundBountyInput) => {
      setCreating(true);
      setError(null);
      try {
        const created = await createBounty(input);
        const ready = await fetchReady();
        if (ready.payment.enabled) {
          if (!smartPay.walletAddress) {
            throw new Error('Connect MetaMask before funding bounty escrow.');
          }
          const paidFetch = await smartPay.createFetchWithPayment();
          await fundBounty(created.bounty.id, { openNow: true }, paidFetch);
        } else {
          await fundBounty(created.bounty.id, { openNow: true });
        }
        return created.bounty;
      } catch (createError) {
        const message =
          createError instanceof Error ? createError.message : 'Failed to create bounty';
        setError(message);
        throw createError;
      } finally {
        setCreating(false);
      }
    },
    [smartPay]
  );

  return {
    walletAddress: smartPay.walletAddress,
    creating,
    error,
    setError,
    createAndFund,
  };
}
