import {
  isRobinhoodPaymentNetwork,
  NETWORK,
  ROBINHOOD_CHAIN_CAIP2,
  X402_BUILTIN_ASSETS,
} from '@bossraid/constants';
import {
  parseBoolean,
  readPositiveNumber,
  type X402AssetTransferMethod,
} from '@bossraid/shared-types';

export interface X402PaymentRequirement {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  price?: string;
  extra?: Record<string, unknown>;
  outputSchema?: Record<string, unknown> | null;
}

export interface X402PaymentRequired {
  x402Version: 1;
  accepts: X402PaymentRequirement[];
  error?: string;
}

export interface X402SettlementResponse {
  success: boolean;
  error?: string;
  transaction?: string;
  network?: string;
  payer?: string;
}

export interface X402VerificationResponse {
  isValid?: boolean;
  valid?: boolean;
  success?: boolean;
  payer?: string;
  error?: string;
}

export interface X402Config {
  enabled: boolean;
  facilitatorUrl?: string;
  resourceBaseUrl: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired?: string;
  maxTimeoutSeconds: number;
  platformMarkupBps: number;
  routeSurchargeUsd: {
    raid: number;
    chat: number;
    inference: number;
    balance: number;
    bounty: number;
  };
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  payaiApiKeyId?: string;
  payaiApiKeySecret?: string;
  facilitatorFallback?: boolean;
  assetName?: string;
  assetVersion?: string;
  assetTransferMethod: X402AssetTransferMethod;
  /** Marian / custom facilitator API key (Bearer or x-api-key). */
  facilitatorApiKey?: string;
}

export type X402RouteName = 'raid' | 'chat' | 'inference' | 'balance' | 'bounty';

export const METAMASK_X402_FACILITATORS = {
  base_mainnet: 'https://tx-sentinel-base-mainnet.dev-api.cx.metamask.io/platform/v2/x402',
  base_sepolia: 'https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402',
} as const;

export type X402FacilitatorPreset = keyof typeof METAMASK_X402_FACILITATORS | 'payai';

const DEFAULT_RAID_SURCHARGE_USD = 0.01;
const DEFAULT_CHAT_SURCHARGE_USD = 0.002;
const DEFAULT_PLATFORM_MARKUP_BPS = 100;
const DEFAULT_MAX_TIMEOUT_SECONDS = 90;

export function isMetaMaskFacilitator(facilitatorUrl: string | undefined): boolean {
  if (!facilitatorUrl) {
    return false;
  }

  return (
    facilitatorUrl.includes('tx-sentinel') ||
    facilitatorUrl.includes('cx.metamask.io/platform/v2/x402')
  );
}

export function isPayAiFacilitator(facilitatorUrl: string | undefined): boolean {
  if (!facilitatorUrl) {
    return false;
  }
  return facilitatorUrl.includes('facilitator.payai.network');
}

function resolveFacilitatorUrl(env: NodeJS.ProcessEnv, _enabled: boolean): string | undefined {
  // Robinhood-only: require explicit Marian (or custom) facilitator URL. No PayAI/Base presets.
  if (env.BOSSRAID_X402_FACILITATOR_URL?.trim()) {
    return env.BOSSRAID_X402_FACILITATOR_URL.trim();
  }
  return undefined;
}

function resolveAssetTransferMethod(env: NodeJS.ProcessEnv): X402AssetTransferMethod {
  const explicit = env.BOSSRAID_X402_ASSET_TRANSFER_METHOD?.trim().toLowerCase();
  if (explicit === 'permit2') {
    return 'permit2';
  }
  // erc7710 retained only for optional agent-session paths; never auto-selected for Base.
  if (explicit === 'erc7710') {
    return 'erc7710';
  }
  return 'permit2';
}

function assertRobinhoodRail(
  config: Pick<X402Config, 'enabled' | 'network' | 'facilitatorUrl'>
): void {
  if (!config.enabled) {
    return;
  }
  if (!isRobinhoodPaymentNetwork(config.network)) {
    throw new Error(
      `x402 network must be Robinhood (${ROBINHOOD_CHAIN_CAIP2}); got ${config.network}. Base/USDC is not supported.`
    );
  }
  if (isPayAiFacilitator(config.facilitatorUrl) || isMetaMaskFacilitator(config.facilitatorUrl)) {
    throw new Error(
      'x402 facilitator must be Marian (or a Robinhood-capable URL), not PayAI or MetaMask Base tx-sentinel.'
    );
  }
}

function formatUsdPrice(amountUsd: number): string {
  if (amountUsd >= 1) {
    if (Math.abs(amountUsd * 100 - Math.round(amountUsd * 100)) < 0.000001) {
      return `$${amountUsd.toFixed(2)}`;
    }

    if (Math.abs(amountUsd * 1_000 - Math.round(amountUsd * 1_000)) < 0.000001) {
      return `$${amountUsd.toFixed(3)}`;
    }

    return `$${amountUsd.toFixed(4)}`;
  }

  if (amountUsd >= 0.01) {
    return `$${amountUsd.toFixed(3)}`;
  }

  return `$${amountUsd.toFixed(4)}`;
}

function usdToAtomicUsdc(amountUsd: number): string {
  return String(Math.max(1, Math.round(amountUsd * 1_000_000)));
}

export function readX402Config(env: NodeJS.ProcessEnv = process.env): X402Config {
  const enabled =
    env.BOSSRAID_X402_ENABLED == null ? false : parseBoolean(env.BOSSRAID_X402_ENABLED);
  const raidSurchargeUsd = readPositiveNumber(
    env.BOSSRAID_X402_RAID_SURCHARGE_USD,
    DEFAULT_RAID_SURCHARGE_USD
  );
  const chatSurchargeUsd = readPositiveNumber(
    env.BOSSRAID_X402_CHAT_SURCHARGE_USD,
    DEFAULT_CHAT_SURCHARGE_USD
  );
  const platformMarkupBps = readPositiveNumber(
    env.BOSSRAID_X402_PLATFORM_MARKUP_BPS,
    DEFAULT_PLATFORM_MARKUP_BPS
  );

  const facilitatorUrl = resolveFacilitatorUrl(env, enabled);

  const config: X402Config = {
    enabled,
    facilitatorUrl,
    resourceBaseUrl:
      env.BOSSRAID_X402_RESOURCE_BASE_URL ??
      `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_API_PORT}`,
    network: env.BOSSRAID_X402_NETWORK ?? ROBINHOOD_CHAIN_CAIP2,
    asset: env.BOSSRAID_X402_ASSET ?? 'usdg',
    // Empty string until configured — zero address is never a valid treasury.
    payTo: env.BOSSRAID_X402_PAY_TO?.trim() || '',
    maxAmountRequired: env.BOSSRAID_X402_MAX_AMOUNT_REQUIRED,
    maxTimeoutSeconds: Math.max(
      1,
      Math.round(
        readPositiveNumber(env.BOSSRAID_X402_MAX_TIMEOUT_SECONDS, DEFAULT_MAX_TIMEOUT_SECONDS)
      )
    ),
    platformMarkupBps,
    routeSurchargeUsd: {
      raid: raidSurchargeUsd,
      chat: chatSurchargeUsd,
      inference: chatSurchargeUsd,
      balance: 0,
      bounty: 0,
    },
    facilitatorFallback: false,
    assetName: env.BOSSRAID_X402_ASSET_NAME,
    assetVersion: env.BOSSRAID_X402_ASSET_VERSION,
    assetTransferMethod: resolveAssetTransferMethod(env),
    facilitatorApiKey:
      env.BOSSRAID_X402_FACILITATOR_API_KEY?.trim() ||
      env.X402_FACILITATOR_API_KEY?.trim() ||
      undefined,
  };

  assertRobinhoodRail(config);
  return config;
}

function buildResourceUrl(resourceBaseUrl: string, resourcePath: string): string {
  const baseUrl = new URL(resourceBaseUrl);
  baseUrl.pathname = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
  baseUrl.search = '';
  baseUrl.hash = '';
  return new URL(resourcePath.replace(/^\/+/, ''), baseUrl).toString();
}

function formatPaymentRequirementNetwork(network: string): string {
  const v1Aliases: Record<string, string> = {
    'eip155:4663': 'robinhood',
    'eip155:46630': 'robinhood-testnet',
  };

  return v1Aliases[network] ?? network;
}

export function computeChargeUsd(
  config: X402Config,
  route: X402RouteName,
  budgetUsd: number
): {
  budgetUsd: number;
  markupUsd: number;
  totalUsd: number;
} {
  const surchargeUsd = config.routeSurchargeUsd[route];
  const normalizedBudget = Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : 0;
  const budgetWithSurcharge = normalizedBudget + surchargeUsd;
  const markupUsd = (budgetWithSurcharge * config.platformMarkupBps) / 10000;
  const totalUsd = budgetWithSurcharge + markupUsd;

  return {
    budgetUsd: budgetWithSurcharge,
    markupUsd,
    totalUsd,
  };
}

function resolveAssetConfig(config: X402Config): {
  asset: string;
  extra?: Record<string, unknown>;
} {
  const lowerAsset = config.asset.toLowerCase();
  const overrideExtra =
    config.assetName || config.assetVersion
      ? {
          ...(config.assetName ? { name: config.assetName } : {}),
          ...(config.assetVersion ? { version: config.assetVersion } : {}),
        }
      : undefined;

  if (config.asset.startsWith('0x')) {
    return {
      asset: config.asset,
      extra: overrideExtra,
    };
  }

  if (!config.network.startsWith('eip155:')) {
    return {
      asset: config.asset,
      extra: overrideExtra,
    };
  }

  if (lowerAsset !== 'usdc' && lowerAsset !== 'usdg') {
    throw new Error(
      "For EVM x402 routes, BOSSRAID_X402_ASSET must be 'usdg', 'usdc', or an ERC-20 token address."
    );
  }

  const byNetwork = X402_BUILTIN_ASSETS[config.network];
  const resolved = byNetwork?.[lowerAsset];
  if (!resolved) {
    throw new Error(
      `No built-in x402 asset metadata for ${config.asset} on ${config.network}. ` +
        `Set BOSSRAID_X402_ASSET to a token address and BOSSRAID_X402_ASSET_NAME/VERSION if needed. ` +
        `Production: network=${ROBINHOOD_CHAIN_CAIP2} asset=usdg (Marian facilitator).`
    );
  }

  return {
    asset: resolved.asset,
    extra: overrideExtra ?? resolved.extra,
  };
}

function buildPaymentRequired(
  config: X402Config,
  route: X402RouteName,
  budgetUsd = 0,
  options: {
    extra?: Record<string, unknown>;
    maxTimeoutSeconds?: number;
  } = {}
): X402PaymentRequired {
  const bountyId = typeof options.extra?.bountyId === 'string' ? options.extra.bountyId : undefined;
  const resourcePath =
    route === 'chat'
      ? '/v1/chat/completions'
      : route === 'inference'
        ? '/v1/inference/chat/completions'
        : route === 'balance'
          ? '/v1/buyer/balance/fund'
          : route === 'bounty'
            ? bountyId
              ? `/v1/bounties/${bountyId}/fund`
              : '/v1/bounties/fund'
            : '/v1/raid';
  const price = computeChargeUsd(config, route, budgetUsd);
  const assetConfig = resolveAssetConfig(config);
  const transferExtra =
    config.assetTransferMethod === 'erc7710' ? { assetTransferMethod: 'erc7710' as const } : {};

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: formatPaymentRequirementNetwork(config.network),
        maxAmountRequired:
          route === 'raid' && config.maxAmountRequired && budgetUsd <= 0
            ? config.maxAmountRequired
            : usdToAtomicUsdc(price.totalUsd),
        resource: buildResourceUrl(config.resourceBaseUrl, resourcePath),
        description:
          route === 'chat'
            ? 'Boss Raid chat completion request'
            : route === 'inference'
              ? 'Boss Raid discount inference request'
              : route === 'balance'
                ? 'Boss Raid prepaid balance top-up'
                : route === 'bounty'
                  ? 'Boss Raid bounty escrow funding'
                  : 'Boss Raid native raid request',
        mimeType: 'application/json',
        payTo: config.payTo,
        maxTimeoutSeconds: options.maxTimeoutSeconds ?? config.maxTimeoutSeconds,
        asset: assetConfig.asset,
        price: formatUsdPrice(price.totalUsd),
        extra: {
          ...(assetConfig.extra ?? {}),
          ...transferExtra,
          ...(options.extra ?? {}),
        },
      },
    ],
  };
}

export function buildX402PaymentRequired(input: {
  route: X402RouteName;
  env?: NodeJS.ProcessEnv;
  budgetUsd?: number;
  extra?: Record<string, unknown>;
  maxTimeoutSeconds?: number;
}): X402PaymentRequired {
  const config = readX402Config(input.env);
  return buildPaymentRequired(config, input.route, input.budgetUsd ?? 0, {
    extra: input.extra,
    maxTimeoutSeconds: input.maxTimeoutSeconds,
  });
}

export function buildPaymentRequiredForRoute(
  config: X402Config,
  route: X402RouteName,
  budgetUsd = 0,
  options: {
    extra?: Record<string, unknown>;
    maxTimeoutSeconds?: number;
  } = {}
): X402PaymentRequired {
  return buildPaymentRequired(config, route, budgetUsd, options);
}
