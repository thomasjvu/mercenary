import { ApiContractError } from '@bossraid/api-contracts';
import { estimateTokenMeteredUsd } from '@bossraid/raid-core';
import { asSingleHeader, type RaidQuoteSnapshot } from '@bossraid/shared-types';
import { readTrustedAlkahestClient } from '../lib/inference-marketplace.js';
import { safeEqualString } from '../lib/http.js';
import { computeSavingsUsd, estimateBenchmarkPriceUsd } from '../marketplace-benchmark.js';
import { type ApiContext } from '../api-context.js';

export interface ManaBillingContext {
  manaAccountId: string;
  sourceAppId: 'alkahest';
  reservationId: string;
  reservedMana: number;
  quoteSnapshot?: RaidQuoteSnapshot;
}

export function createManaBillingHandlers(ctx: ApiContext) {
  function readManaBillingHeaders(
    headers: Record<string, string | string[] | undefined>
  ): { manaAccountId: string; sourceAppId: 'alkahest' } | undefined {
    const trustedClient = readTrustedAlkahestClient(headers);
    const manaAccountId = asSingleHeader(headers['x-bossraid-mana-account-id']);
    if (!trustedClient && !manaAccountId) {
      return undefined;
    }
    if (!trustedClient || !manaAccountId) {
      throw new ApiContractError('Trusted Alkahest mana billing headers are incomplete.', 401);
    }
    const trustedKey = ctx.env.BOSSRAID_API_KEY || ctx.env.BOSSRAID_TRUSTED_CLIENT_KEY;
    if (!trustedKey) {
      throw new ApiContractError('BOSSRAID_API_KEY is required for trusted mana billing.', 503);
    }
    if (!safeEqualString(asSingleHeader(headers.authorization), `Bearer ${trustedKey}`)) {
      throw new ApiContractError('Invalid trusted Boss Raid client credential.', 401);
    }
    return { manaAccountId, sourceAppId: 'alkahest' };
  }

  function buildManaCoreUrl(path: string): string {
    const rawBase = ctx.env.BOSSRAID_MANA_CORE_URL?.trim();
    if (!rawBase) {
      throw new ApiContractError('BOSSRAID_MANA_CORE_URL is required for mana billing.', 503);
    }
    const base = rawBase.replace(/\/$/, '');
    if (base.endsWith('/v1/mana')) {
      return `${base}${path}`;
    }
    if (base.endsWith('/v1')) {
      return `${base}/mana${path}`;
    }
    return `${base}/v1/mana${path}`;
  }

  async function callManaCore(path: string, body: Record<string, unknown>) {
    const key = ctx.env.BOSSRAID_MANA_CORE_KEY?.trim();
    if (!key) {
      throw new ApiContractError('BOSSRAID_MANA_CORE_KEY is required for mana billing.', 503);
    }
    const response = await fetch(buildManaCoreUrl(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mana-core-key': key,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : 'Mana Core request failed.';
      throw new ApiContractError(message, response.status);
    }
    return payload;
  }

  async function reserveManaBilling(input: {
    route: 'raid' | 'chat' | 'inference';
    manaAccountId: string;
    amount: number;
    requestKey: string;
    quoteSnapshot?: RaidQuoteSnapshot;
  }): Promise<ManaBillingContext> {
    const payload = await callManaCore('/reservations', {
      manaAccountId: input.manaAccountId,
      appId: ctx.env.BOSSRAID_MANA_CORE_APP_ID || 'bossraid',
      action: input.route,
      amount: input.amount,
      idempotencyKey: `bossraid:${input.route}:${input.requestKey}`,
      metadata: {
        sourceAppId: 'alkahest',
        quoteId: input.quoteSnapshot?.quoteId,
        maxChargeMana: input.quoteSnapshot?.manaQuote.maxChargeMana,
        maxChargeUsd: input.quoteSnapshot?.maxChargeUsd,
      },
    });
    const reservation = payload.reservation as { id?: unknown; amount?: unknown } | undefined;
    const reservationId = typeof reservation?.id === 'string' ? reservation.id : undefined;
    if (!reservationId) {
      throw new ApiContractError('Mana Core reservation response did not include an id.', 502);
    }
    return {
      manaAccountId: input.manaAccountId,
      sourceAppId: 'alkahest',
      reservationId,
      reservedMana: input.amount,
      quoteSnapshot: input.quoteSnapshot,
    };
  }

  function calculateManaCaptureAmount(
    manaBilling: ManaBillingContext,
    usage: { prompt_tokens?: number; completion_tokens?: number }
  ): number {
    const quote = manaBilling.quoteSnapshot;
    const primary = quote?.providers.find((provider) => provider.phase === 'primary');
    if (!quote || !primary) {
      return manaBilling.reservedMana;
    }
    const pricing = primary.rateCard;
    const promptTokens = Math.max(0, usage.prompt_tokens ?? 0);
    const completionTokens = Math.max(0, usage.completion_tokens ?? 0);
    const chargeUsd =
      pricing.mode === 'token_metered'
        ? estimateTokenMeteredUsd(pricing, promptTokens, completionTokens)
        : (pricing.pricePerTaskUsd ?? quote.maxChargeUsd);
    return Math.max(
      1,
      Math.min(manaBilling.reservedMana, Math.ceil(chargeUsd * quote.manaQuote.manaPerUsd))
    );
  }

  async function captureManaBilling(input: {
    manaBilling?: ManaBillingContext;
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    raidId: string;
    receiptPath: string;
  }): Promise<{ capturedMana?: number; refundedMana?: number } | undefined> {
    if (!input.manaBilling) {
      return undefined;
    }
    const capturedMana = calculateManaCaptureAmount(input.manaBilling, input.usage);
    await callManaCore(
      `/reservations/${encodeURIComponent(input.manaBilling.reservationId)}/capture`,
      {
        manaAccountId: input.manaBilling.manaAccountId,
        amount: capturedMana,
        metadata: {
          sourceAppId: input.manaBilling.sourceAppId,
          raidId: input.raidId,
          receiptPath: input.receiptPath,
          quoteId: input.manaBilling.quoteSnapshot?.quoteId,
          usage: input.usage,
        },
      }
    );
    return {
      capturedMana,
      refundedMana: Math.max(0, input.manaBilling.reservedMana - capturedMana),
    };
  }

  async function refundManaBilling(input: {
    manaBilling?: ManaBillingContext;
    reason: string;
    raidId?: string;
  }): Promise<void> {
    if (!input.manaBilling) {
      return;
    }
    await callManaCore(
      `/reservations/${encodeURIComponent(input.manaBilling.reservationId)}/refund`,
      {
        manaAccountId: input.manaBilling.manaAccountId,
        reason: input.reason,
        metadata: {
          sourceAppId: input.manaBilling.sourceAppId,
          raidId: input.raidId,
          quoteId: input.manaBilling.quoteSnapshot?.quoteId,
        },
      }
    );
  }

  function buildBossRaidBillingMetadata(input: {
    manaBilling?: ManaBillingContext;
    settlement?: { capturedMana?: number; refundedMana?: number };
    selectedSeller?: string;
    receiptPath: string;
    modelId?: string;
    paidPriceUsd?: number;
    quoteSnapshot?: RaidQuoteSnapshot;
  }) {
    const quote = input.manaBilling?.quoteSnapshot ?? input.quoteSnapshot;
    const selected = quote?.providers.find(
      (provider) => provider.providerId === input.selectedSeller || provider.phase === 'primary'
    );
    const benchmarkPriceUsd =
      input.modelId != null || input.paidPriceUsd != null
        ? estimateBenchmarkPriceUsd({
            modelId: input.modelId,
            flatTaskUsd: input.paidPriceUsd,
          })
        : undefined;
    const savingsUsd =
      input.paidPriceUsd != null
        ? computeSavingsUsd(benchmarkPriceUsd, input.paidPriceUsd)
        : undefined;

    if (!input.manaBilling && !quote && input.paidPriceUsd == null) {
      return undefined;
    }

    return {
      quote_id: quote?.quoteId,
      selected_seller: input.selectedSeller ?? selected?.providerId,
      rate_card_hash: selected?.rateCard.rateCardHash,
      mana_reserved: input.manaBilling?.reservedMana,
      mana_captured: input.settlement?.capturedMana,
      mana_refunded: input.settlement?.refundedMana,
      benchmark_price_usd: benchmarkPriceUsd,
      savings_usd: savingsUsd,
      paid_price_usd: input.paidPriceUsd,
      receipt_path: input.receiptPath,
      attestation_result: selected?.attestationSummary,
      routing_proof: {
        strict_privacy: quote?.privacyMode === 'strict',
        required_privacy_features: quote?.requiredPrivacyFeatures,
        required_verification_status: quote?.requiredVerificationStatus,
        require_erc8004: quote?.requireErc8004,
        min_trust_score: quote?.minTrustScore,
      },
    };
  }

  return {
    readManaBillingHeaders,
    buildManaCoreUrl,
    callManaCore,
    reserveManaBilling,
    calculateManaCaptureAmount,
    captureManaBilling,
    refundManaBilling,
    buildBossRaidBillingMetadata,
  };
}
