import { type ApiContext } from '../api-context.js';
import { readX402Config, type X402Config } from '../x402-config.js';

const ZERO_PAY_TO = '0x0000000000000000000000000000000000000000';

export function readX402ConfigForContext(
  ctx: Pick<ApiContext, 'env' | 'controlState'>
): X402Config {
  const config = readX402Config(ctx.env);
  return {
    ...config,
    enabled: ctx.controlState.readX402Enabled(),
    facilitatorUrl: ctx.controlState.readX402Enabled()
      ? (config.facilitatorUrl ?? 'https://facilitator.payai.network')
      : config.facilitatorUrl,
  };
}

export function x402PayToConfigured(config: X402Config): boolean {
  return config.payTo !== ZERO_PAY_TO;
}

export function buildX402SettingsView(ctx: Pick<ApiContext, 'env' | 'controlState'>) {
  const config = readX402Config(ctx.env);
  const enabled = ctx.controlState.readX402Enabled();
  const payToConfigured = x402PayToConfigured(config);

  return {
    enabled,
    envDefault: ctx.env.BOSSRAID_X402_ENABLED ?? null,
    network: config.network,
    asset: config.asset,
    payToConfigured,
    facilitatorConfigured: Boolean(config.facilitatorUrl) || enabled,
    canEnable: payToConfigured,
    payTo: payToConfigured ? config.payTo : null,
  };
}
