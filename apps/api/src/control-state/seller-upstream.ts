import { randomUUID } from 'node:crypto';
import { UPSTREAM_PROVIDER_CONFIG } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import type { SecretCipher } from '@bossraid/persistence';
import type { ControlStateContext } from './state-context.js';
import type { SellerUpstreamConfigEntry } from './types.js';

const KEY_PREFIX_BY_PROVIDER: Record<UpstreamProviderId, string> = {
  venice: 'vn',
  redpill: 'rp',
  near: 'nr',
  chutes: 'ch',
  phala: 'ph',
  xai: 'xa',
};

export function buildUpstreamKeyPrefix(provider: UpstreamProviderId, apiKey: string): string {
  const trimmed = apiKey.trim();
  const tag = KEY_PREFIX_BY_PROVIDER[provider];
  if (trimmed.length <= 8) {
    return `${tag}_***`;
  }
  return `${tag}_${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export class SellerUpstreamEncryptionRequiredError extends Error {
  constructor() {
    super('BOSSRAID_SECRET_ENCRYPTION_KEY is required before storing seller upstream API keys.');
    this.name = 'SellerUpstreamEncryptionRequiredError';
  }
}

export function upsertSellerUpstreamConfig(
  ctx: ControlStateContext,
  input: {
    wallet: string;
    provider: UpstreamProviderId;
    apiKey: string;
    cipher: SecretCipher;
    upstreamBase?: string;
    requireEncryption?: boolean;
  },
  nowMs = Date.now()
): SellerUpstreamConfigEntry {
  if (input.requireEncryption && !input.cipher.enabled) {
    throw new SellerUpstreamEncryptionRequiredError();
  }
  const wallet = input.wallet.toLowerCase();
  const now = new Date(nowMs).toISOString();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const upstreamBase = input.upstreamBase ?? UPSTREAM_PROVIDER_CONFIG[input.provider].upstreamBase;
  const existing = snapshot.sellerUpstreamConfigs.find(
    (entry) => entry.wallet === wallet && entry.provider === input.provider
  );
  const config: SellerUpstreamConfigEntry = {
    configId: existing?.configId ?? `${input.provider}_cfg_${randomUUID()}`,
    wallet,
    provider: input.provider,
    apiKeyCiphertext: input.cipher.enabled
      ? input.cipher.encrypt(input.apiKey.trim())
      : input.apiKey.trim(),
    keyPrefix: buildUpstreamKeyPrefix(input.provider, input.apiKey),
    upstreamBase,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  snapshot.sellerUpstreamConfigs = [
    ...snapshot.sellerUpstreamConfigs.filter(
      (entry) => !(entry.wallet === wallet && entry.provider === input.provider)
    ),
    config,
  ];
  ctx.writeState(snapshot);
  return structuredClone(config);
}

export function readSellerUpstreamConfig(
  ctx: ControlStateContext,
  wallet: string,
  provider: UpstreamProviderId,
  nowMs = Date.now()
): SellerUpstreamConfigEntry | undefined {
  const { snapshot } = ctx.readPrunedState(nowMs);
  return snapshot.sellerUpstreamConfigs.find(
    (entry) => entry.wallet === wallet.toLowerCase() && entry.provider === provider
  );
}

export function listSellerUpstreamConfigs(
  ctx: ControlStateContext,
  wallet: string,
  nowMs = Date.now()
): SellerUpstreamConfigEntry[] {
  const { snapshot } = ctx.readPrunedState(nowMs);
  return snapshot.sellerUpstreamConfigs.filter((entry) => entry.wallet === wallet.toLowerCase());
}

export function readSellerUpstreamApiKey(
  ctx: ControlStateContext,
  wallet: string,
  provider: UpstreamProviderId,
  cipher: SecretCipher,
  nowMs = Date.now()
): string | undefined {
  const config = readSellerUpstreamConfig(ctx, wallet, provider, nowMs);
  if (!config) {
    return undefined;
  }
  return cipher.enabled ? cipher.decrypt(config.apiKeyCiphertext) : config.apiKeyCiphertext;
}

export function deleteSellerUpstreamConfig(
  ctx: ControlStateContext,
  wallet: string,
  provider: UpstreamProviderId,
  nowMs = Date.now()
): boolean {
  const normalized = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const before = snapshot.sellerUpstreamConfigs.length;
  snapshot.sellerUpstreamConfigs = snapshot.sellerUpstreamConfigs.filter(
    (entry) => !(entry.wallet === normalized && entry.provider === provider)
  );
  if (snapshot.sellerUpstreamConfigs.length === before) {
    return false;
  }
  ctx.writeState(snapshot);
  return true;
}

export function sanitizeSellerUpstreamConfig(
  config: SellerUpstreamConfigEntry
): Omit<SellerUpstreamConfigEntry, 'apiKeyCiphertext'> & { configured: true } {
  return {
    configId: config.configId,
    wallet: config.wallet,
    provider: config.provider,
    keyPrefix: config.keyPrefix,
    upstreamBase: config.upstreamBase,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    configured: true,
  };
}
