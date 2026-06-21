export const INFISICAL_PHALA_CORE_PATH = '/bossraid/phala/core';
export const INFISICAL_PHALA_ONCHAIN_PATH = '/bossraid/phala/onchain';
export const LEGACY_INFISICAL_PHALA_PATH = '/bossraid/phala';

export const PHALA_CORE_KEYS = [
  'MNEMONIC',
  'BOSSRAID_IMAGE',
  'BOSSRAID_EVALUATOR_IMAGE',
  'BOSSRAID_EVAL_JOB_CONTAINER_IMAGE',
  'BOSSRAID_ADMIN_TOKEN',
  'BOSSRAID_REGISTRY_TOKEN',
  'BOSSRAID_SECRET_ENCRYPTION_KEY',
  'BOSSRAID_EVAL_SANDBOX_TOKEN',
  'BOSSRAID_PROVIDER_A_TOKEN',
  'BOSSRAID_PROVIDER_B_TOKEN',
  'BOSSRAID_PROVIDER_C_TOKEN',
  'BOSSRAID_VENICE_API_KEY',
  'PAYAI_API_KEY_ID',
  'PAYAI_API_KEY_SECRET',
  'BOSSRAID_X402_PAY_TO',
];

export const PHALA_ONCHAIN_KEYS = [
  'BOSSRAID_CLIENT_PRIVATE_KEY',
  'BOSSRAID_EVALUATOR_ADDRESS',
  'BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY',
  'BOSSRAID_PROVIDER_ADDRESS_MAP_JSON',
  'BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON',
  'BOSSRAID_REGISTRY_ADDRESS',
  'BOSSRAID_ESCROW_ADDRESS',
  'BOSSRAID_BOUNTY_ESCROW_ADDRESS',
  'BOSSRAID_RPC_URL',
  'BOSSRAID_CHAIN_ID',
  'BOSSRAID_TOKEN_ADDRESS',
  'BOSSRAID_ERC8004_AGENT_ID',
  'BOSSRAID_ERC8004_OPERATOR_WALLET',
  'BOSSRAID_ERC8004_REGISTRATION_TX',
  'BOSSRAID_ERC8004_IDENTITY_REGISTRY',
];

const LEGACY_PROVIDER_ID_MAP = {
  'unity-specialist-a': 'dottie',
  'minimal-diff-hunter': 'riko',
  'regression-averse-maintainer': 'gamma',
};

export function normalizeProviderSettlementIds(entries = {}) {
  const normalized = { ...entries };

  for (const key of [
    'BOSSRAID_PROVIDER_ADDRESS_MAP_JSON',
    'BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON',
  ]) {
    const raw = normalized[key];
    if (!raw?.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      const remapped = {};
      let changed = false;

      for (const [providerId, value] of Object.entries(parsed)) {
        const nextId = LEGACY_PROVIDER_ID_MAP[providerId] ?? providerId;
        if (nextId !== providerId) {
          changed = true;
        }
        remapped[nextId] = value;
      }

      if (changed) {
        normalized[key] = JSON.stringify(remapped);
      }
    } catch {
      // Keep invalid JSON untouched so preflight can surface it.
    }
  }

  return normalized;
}

const PROVIDER_SUFFIXES = ['A', 'B', 'C'];
const PROVIDER_MODEL_API_KEY_KEYS = PROVIDER_SUFFIXES.map(
  (suffix) => `BOSSRAID_PROVIDER_${suffix}_MODEL_API_KEY`
);

const VENICE_SOURCE_KEYS = [
  'BOSSRAID_VENICE_API_KEY',
  'VENICE_API_KEY',
  ...PROVIDER_MODEL_API_KEY_KEYS,
  'VENICE_API_KEY_DOTTIE',
  'VENICE_API_KEY_RIKO',
  'VENICE_API_KEY_GAMMA',
];

export function parseDotenv(text) {
  const entries = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (key) {
      entries[key] = value;
    }
  }
  return entries;
}

export function formatDotenvEntries(entries) {
  return Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join('\n')
    .concat('\n');
}

export function isRealValue(value) {
  if (!value?.trim()) {
    return false;
  }
  const trimmed = value.trim();
  return !(
    /^<.+>$/u.test(trimmed) ||
    /replace|changeme|todo|from-|your-org/iu.test(trimmed) ||
    /^0x0+$/iu.test(trimmed)
  );
}

export function resolveVeniceApiKey(entries) {
  for (const key of VENICE_SOURCE_KEYS) {
    if (isRealValue(entries[key])) {
      return entries[key].trim();
    }
  }
  return '';
}

export function pickTierEntries(entries, keys) {
  const picked = {};
  for (const key of keys) {
    if (isRealValue(entries[key])) {
      picked[key] = entries[key].trim();
    }
  }
  return picked;
}

export function splitDeployEnv(entries) {
  const normalized = normalizeProviderSettlementIds(entries);
  const veniceApiKey = resolveVeniceApiKey(normalized);
  if (veniceApiKey) {
    normalized.BOSSRAID_VENICE_API_KEY = veniceApiKey;
  }

  const core = pickTierEntries(normalized, PHALA_CORE_KEYS);
  const onchain = pickTierEntries(normalized, PHALA_ONCHAIN_KEYS);

  return { core, onchain };
}

export function buildDeployDefaults(merged = {}) {
  const veniceApiKey = resolveVeniceApiKey(merged);
  const providerModel = merged.VENICE_MODEL ?? merged.BOSSRAID_VENICE_MODEL ?? 'minimax-m27';
  const providerModelBase = merged.VENICE_API_BASE ?? 'https://api.venice.ai/api/v1';

  const defaults = {
    BOSSRAID_PROVIDERS_FILE: '/app/examples/game-raid/providers.compose.json',
    BOSSRAID_TEE_SOCKET_PATH: '/var/run/dstack.sock',
    BOSSRAID_SECRET_ENCRYPTION_KEY_ID: 'phala-2026-05',
    BOSSRAID_SETTLEMENT_FUND_JOBS: 'true',
    BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS: 'true',
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_NETWORK: 'eip155:8453',
    BOSSRAID_X402_ASSET: 'usdc',
    BOSSRAID_X402_ASSET_NAME: 'USDC',
    BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.payai.network',
    BOSSRAID_PUBLIC_RATE_LIMIT_MAX: '60',
    BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: '60000',
    BOSSRAID_BUYER_KEY_RATE_LIMIT_MAX: '120',
    BOSSRAID_BUYER_KEY_RATE_LIMIT_WINDOW_MS: '60000',
    BOSSRAID_BUYER_KEY_DEFAULT_SPEND_LIMIT_USD: '25',
    BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD: '5',
    BOSSRAID_METRICS_PUBLIC: 'false',
    BOSSRAID_OPERATOR_TERMS_ACK: 'true',
    BOSSRAID_INCIDENT_RESPONSE_ACK: 'true',
    BOSSRAID_PROVIDER_A_ID: 'dottie',
    BOSSRAID_PROVIDER_A_NAME: 'Dottie',
    BOSSRAID_PROVIDER_A_MODE: 'pixel_art',
    BOSSRAID_PROVIDER_A_INSTRUCTIONS:
      'Specialize in pixel-art asset packs, spritesheets, UI frames, and compact retro palettes.',
    BOSSRAID_PROVIDER_B_ID: 'riko',
    BOSSRAID_PROVIDER_B_NAME: 'Riko',
    BOSSRAID_PROVIDER_B_MODE: 'remotion',
    BOSSRAID_PROVIDER_B_INSTRUCTIONS:
      'Specialize in game marketing videos, teaser hooks, launch copy, and Remotion-ready promo bundles.',
    BOSSRAID_PROVIDER_C_ID: 'gamma',
    BOSSRAID_PROVIDER_C_NAME: 'Gamma',
    BOSSRAID_PROVIDER_C_MODE: 'gbstudio',
    BOSSRAID_PROVIDER_C_INSTRUCTIONS:
      'Specialize in small game-development slices, gameplay logic, and minimal repo patches that keep one clear hook.',
    BOSSRAID_PROVIDER_A_MODEL_API_BASE: providerModelBase,
    BOSSRAID_PROVIDER_B_MODEL_API_BASE: providerModelBase,
    BOSSRAID_PROVIDER_C_MODEL_API_BASE: providerModelBase,
    BOSSRAID_PROVIDER_A_MODEL: resolveProviderModel(merged.BOSSRAID_PROVIDER_A_MODEL, providerModel),
    BOSSRAID_PROVIDER_B_MODEL: resolveProviderModel(merged.BOSSRAID_PROVIDER_B_MODEL, providerModel),
    BOSSRAID_PROVIDER_C_MODEL: resolveProviderModel(merged.BOSSRAID_PROVIDER_C_MODEL, providerModel),
  };

  if (veniceApiKey) {
    defaults.BOSSRAID_VENICE_API_KEY = veniceApiKey;
    for (const suffix of PROVIDER_SUFFIXES) {
      defaults[`BOSSRAID_PROVIDER_${suffix}_MODEL_API_KEY`] = veniceApiKey;
    }
  }

  return defaults;
}

function resolveProviderModel(value, fallback) {
  if (isRealValue(value) && value.trim() !== 'gpt-5.5') {
    return value.trim();
  }
  return fallback;
}

export function assembleDeployEnv(core = {}, onchain = {}, options = {}) {
  const normalizedOnchain = normalizeProviderSettlementIds(onchain);
  const defaults = buildDeployDefaults({ ...core, ...normalizedOnchain, ...options });
  const merged = normalizeProviderSettlementIds({ ...defaults, ...normalizedOnchain, ...core });

  merged.BOSSRAID_SETTLEMENT_MODE = isRealValue(onchain.BOSSRAID_REGISTRY_ADDRESS)
    ? 'onchain'
    : 'file';

  if (merged.BOSSRAID_SETTLEMENT_MODE === 'onchain') {
    merged.BOSSRAID_RPC_URL = onchain.BOSSRAID_RPC_URL ?? 'https://mainnet.base.org';
    merged.BOSSRAID_CHAIN_ID = onchain.BOSSRAID_CHAIN_ID ?? '8453';
    merged.BOSSRAID_TOKEN_ADDRESS =
      onchain.BOSSRAID_TOKEN_ADDRESS ?? '0x833589fCD6eDb6B08d2E354A1d9441D5b2AaE4a5';
  }

  const veniceApiKey = resolveVeniceApiKey(merged);
  if (veniceApiKey) {
    merged.BOSSRAID_VENICE_API_KEY = veniceApiKey;
    for (const suffix of PROVIDER_SUFFIXES) {
      merged[`BOSSRAID_PROVIDER_${suffix}_MODEL_API_KEY`] = veniceApiKey;
    }
  }

  return merged;
}

export function mergeInfisicalTierSecrets(coreSecrets = [], onchainSecrets = []) {
  const core = Object.fromEntries(
    coreSecrets.map((secret) => [secret.secretKey, secret.secretValue ?? ''])
  );
  const onchain = Object.fromEntries(
    onchainSecrets.map((secret) => [secret.secretKey, secret.secretValue ?? ''])
  );
  return assembleDeployEnv(core, onchain);
}