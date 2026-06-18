import type {
  AwardBountyBidsInput,
  CreateBountyBidInput,
  CreateBountyInput,
  DeliverBountyAwardInput,
} from '@bossraid/shared-types';
import {
  ApiContractError,
  ensureNumber,
  ensureOptionalString,
  ensureRecord,
  ensureString,
} from '../validation.js';

export function parseCreateBountyInput(value: unknown): CreateBountyInput {
  const input = ensureRecord(value, 'bounty');
  const rewardAmountUsd = ensureNumber(
    Number(input.rewardAmountUsd ?? input.reward_amount_usd),
    'bounty.reward_amount_usd'
  );
  if (rewardAmountUsd <= 0) {
    throw new ApiContractError('bounty.reward_amount_usd must be positive.');
  }
  return {
    title: ensureString(input.title, 'bounty.title'),
    description: ensureString(input.description, 'bounty.description'),
    requirements: ensureString(input.requirements, 'bounty.requirements'),
    rewardAmountUsd,
    currency: ensureOptionalString(input.currency, 'bounty.currency'),
    maxAwards:
      input.maxAwards == null && input.max_awards == null
        ? undefined
        : ensureNumber(Number(input.maxAwards ?? input.max_awards), 'bounty.max_awards'),
    biddingDeadlineAt: ensureOptionalString(
      input.biddingDeadlineAt ?? input.bidding_deadline_at,
      'bounty.bidding_deadline_at'
    ),
    awardDeadlineAt: ensureOptionalString(
      input.awardDeadlineAt ?? input.award_deadline_at,
      'bounty.award_deadline_at'
    ),
    deliveryDeadlineAt: ensureOptionalString(
      input.deliveryDeadlineAt ?? input.delivery_deadline_at,
      'bounty.delivery_deadline_at'
    ),
    acceptDeadlineAt: ensureOptionalString(
      input.acceptDeadlineAt ?? input.accept_deadline_at,
      'bounty.accept_deadline_at'
    ),
  };
}

export function parseCreateBountyBidInput(value: unknown): CreateBountyBidInput {
  const input = ensureRecord(value, 'bid');
  return {
    providerId: ensureString(input.providerId ?? input.provider_id, 'bid.provider_id'),
    agentId: ensureOptionalString(input.agentId ?? input.agent_id, 'bid.agent_id'),
    priceUsd: ensureNumber(Number(input.priceUsd ?? input.price_usd), 'bid.price_usd'),
    etaHours: ensureNumber(Number(input.etaHours ?? input.eta_hours), 'bid.eta_hours'),
    pitch: ensureString(input.pitch, 'bid.pitch'),
  };
}

export function parseAwardBountyBidsInput(value: unknown): AwardBountyBidsInput {
  const input = ensureRecord(value, 'award');
  const bidIdsSource = input.bidIds ?? input.bid_ids;
  if (!Array.isArray(bidIdsSource) || bidIdsSource.length === 0) {
    throw new ApiContractError('award.bid_ids must be a non-empty array.');
  }
  const bidIds = bidIdsSource.map((entry, index) => ensureString(entry, `award.bid_ids[${index}]`));
  const amountsSource = input.amountsUsd ?? input.amounts_usd;
  const amountsUsd =
    amountsSource == null
      ? undefined
      : (amountsSource as unknown[]).map((entry, index) =>
          ensureNumber(Number(entry), `award.amounts_usd[${index}]`)
        );
  return { bidIds, amountsUsd };
}

export function parseDeliverBountyAwardInput(value: unknown): DeliverBountyAwardInput {
  const input = ensureRecord(value, 'delivery');
  const artifactsJson = ensureString(
    input.artifactsJson ?? input.artifacts_json,
    'delivery.artifacts_json'
  );
  const deliveryHash = ensureString(
    input.deliveryHash ?? input.delivery_hash,
    'delivery.delivery_hash'
  );
  return {
    artifactSummary: ensureString(
      input.artifactSummary ?? input.artifact_summary,
      'delivery.artifact_summary'
    ),
    artifactsJson,
    deliveryHash,
  };
}
