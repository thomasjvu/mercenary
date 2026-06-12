import { NETWORK } from '@bossraid/constants';

export function resolveInferenceGatewayBase(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.BOSSRAID_INFERENCE_GATEWAY_BASE?.trim();
  if (configured) {
    return configured.replace(/\/+$/u, '');
  }

  const host = env.BOSSRAID_API_HOST ?? env.HOST ?? NETWORK.LOCALHOST;
  const port = env.PORT ?? String(NETWORK.LOCAL_API_PORT);
  return `http://${host}:${port}`;
}

export function resolveInferenceGatewayProviderEndpoint(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${resolveInferenceGatewayBase(env)}/gateway/${encodeURIComponent(providerId)}`;
}

export function buildUpstreamSellerProviderId(
  provider: string,
  wallet: string,
  modelId: string
): string {
  const walletSlice = wallet.slice(2, 8).toLowerCase();
  const modelSlug = modelId
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${provider}-seller-${walletSlice}-${modelSlug}`.slice(0, 96);
}

export function buildVeniceSellerProviderId(wallet: string, modelId: string): string {
  return buildUpstreamSellerProviderId('venice', wallet, modelId);
}
