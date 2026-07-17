import { ROBINHOOD_CHAIN_CAIP2, ROBINHOOD_USDG_ADDRESS } from '@bossraid/constants';
import { type ApiContext } from '../api-context.js';
import { readX402Config, type X402Config } from '../x402-config.js';

const ZERO_PAY_TO = '0x0000000000000000000000000000000000000000';

export function readX402ConfigForContext(
  ctx: Pick<ApiContext, 'env' | 'controlState'>
): X402Config {
  const config = readX402Config(ctx.env);
  const enabled = ctx.controlState.readX402Enabled();
  // Marian URL must be set explicitly — no PayAI/Base fallback.
  return {
    ...config,
    enabled,
  };
}

export function x402PayToConfigured(config: X402Config): boolean {
  const payTo = config.payTo?.trim() ?? '';
  return payTo.length > 0 && payTo.toLowerCase() !== ZERO_PAY_TO;
}

export function isRobinhoodUsdGRail(config: X402Config): boolean {
  const networkOk =
    config.network === ROBINHOOD_CHAIN_CAIP2 || config.network.startsWith('eip155:4663');
  const asset = config.asset?.toLowerCase() ?? '';
  const assetOk = asset === 'usdg' || asset === ROBINHOOD_USDG_ADDRESS.toLowerCase();
  return networkOk && assetOk;
}

function readFacilitatorHost(facilitatorUrl: string | undefined): string | null {
  if (!facilitatorUrl) {
    return null;
  }
  try {
    return new URL(facilitatorUrl).host;
  } catch {
    return facilitatorUrl;
  }
}

export function buildX402SettingsView(ctx: Pick<ApiContext, 'env' | 'controlState'>) {
  const config = readX402Config(ctx.env);
  const enabled = ctx.controlState.readX402Enabled();
  const payToConfigured = x402PayToConfigured(config);
  const facilitatorConfigured = Boolean(config.facilitatorUrl);
  const robinhoodRail = isRobinhoodUsdGRail(config);
  const blockers: string[] = [];

  if (!payToConfigured) {
    blockers.push('Set BOSSRAID_X402_PAY_TO to a non-zero Robinhood treasury wallet.');
  }
  if (!facilitatorConfigured) {
    blockers.push(
      'Set BOSSRAID_X402_FACILITATOR_URL to the Marian (Surplus) facilitator for eip155:4663 USDG.'
    );
  }
  if (enabled && !robinhoodRail) {
    blockers.push('x402 network/asset must be Robinhood + USDG (Base USDC is not supported).');
  }
  if (enabled && robinhoodRail && !config.facilitatorApiKey) {
    blockers.push(
      'Set BOSSRAID_X402_FACILITATOR_API_KEY (Marian console key) for authenticated settle/verify.'
    );
  }

  return {
    enabled,
    envDefault: ctx.env.BOSSRAID_X402_ENABLED ?? null,
    network: config.network,
    asset: config.asset,
    payToConfigured,
    facilitatorConfigured,
    facilitator: readFacilitatorHost(config.facilitatorUrl),
    robinhoodUsdG: robinhoodRail,
    canEnable: payToConfigured && facilitatorConfigured,
    blockers,
    payTo: payToConfigured ? config.payTo : null,
  };
}
