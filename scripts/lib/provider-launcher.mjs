import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveProviderProfileFiles(rootDir, env = process.env) {
  const raw = env.BOSSRAID_PROVIDERS_FILE ?? './examples/inference-marketplace-providers.json';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolve(rootDir, entry));
}

export function loadProviderProfiles(rootDir, env = process.env) {
  const providerFiles = resolveProviderProfileFiles(rootDir, env);
  const providerProfiles = providerFiles.flatMap((providersFile) => {
    const profiles = JSON.parse(readFileSync(providersFile, 'utf8'));
    if (!Array.isArray(profiles) || profiles.length === 0) {
      throw new Error(`No provider profiles found in ${providersFile}.`);
    }
    return profiles;
  });

  if (providerProfiles.length === 0) {
    throw new Error('No provider profiles found in configured provider files.');
  }

  return { providersFile: providerFiles.join(','), providerProfiles };
}

export function inferProviderMode(profile) {
  const tags = [
    ...(Array.isArray(profile.specializations) ? profile.specializations : []),
    ...(Array.isArray(profile.supportedFrameworks) ? profile.supportedFrameworks : []),
  ].map((value) => String(value).toLowerCase());

  if (tags.includes('gb-studio')) {
    return 'gbstudio';
  }
  if (tags.includes('pixel-art')) {
    return 'pixel_art';
  }
  if (tags.includes('remotion')) {
    return 'remotion';
  }
  return 'generic';
}

export function resolveProviderKeyEnv(profile, mode, env = process.env) {
  if (typeof profile.modelApiKeyEnv === 'string' && env[profile.modelApiKeyEnv]) {
    return profile.modelApiKeyEnv;
  }

  const candidates = new Set();
  const displayName = String(profile.displayName ?? '').toLowerCase();
  const providerId = String(profile.providerId ?? '').toLowerCase();

  if (mode === 'gbstudio' || providerId.includes('regression-averse')) {
    candidates.add('VENICE_API_KEY_GAMMA');
  }
  if (mode === 'remotion' || providerId.includes('minimal-diff')) {
    candidates.add('VENICE_API_KEY_RIKO');
  }
  if (mode === 'pixel_art' || providerId.includes('unity-specialist')) {
    candidates.add('VENICE_API_KEY_DOTTIE');
  }

  for (const candidate of candidates) {
    if (env[candidate]) {
      return candidate;
    }
  }
  return undefined;
}

export function resolvePrivacyFeatures(profile) {
  const privacy = profile.privacy && typeof profile.privacy === 'object' ? profile.privacy : {};
  return [
    privacy.teeAttested ? 'tee_attested' : undefined,
    privacy.e2ee ? 'e2ee' : undefined,
    privacy.noDataRetention ? 'no_data_retention' : undefined,
    privacy.signedOutputs ? 'signed_outputs' : undefined,
  ]
    .filter(Boolean)
    .join(',');
}

export function buildProviderInstructions(profile, mode) {
  if (mode === 'gbstudio') {
    return 'Specialize in small game-development slices, gameplay logic, and minimal repo patches that keep one clear hook.';
  }
  if (mode === 'pixel_art') {
    return 'Specialize in pixel-art asset packs, spritesheets, UI frames, and compact retro palettes.';
  }
  if (mode === 'remotion') {
    return 'Specialize in game marketing videos, teaser hooks, launch copy, storyboard beats, and Remotion-ready promo bundles.';
  }
  return profile.description ?? 'Specialize in precise scoped contributions for Mercenary.';
}

export function resolveProviderModelConfig(profile, mode, env = process.env) {
  const keyEnv = resolveProviderKeyEnv(profile, mode, env);
  const providerModelApiKey = keyEnv ? env[keyEnv] : undefined;
  const usingVenice =
    Boolean(providerModelApiKey) ||
    String(profile.modelFamily ?? '')
      .toLowerCase()
      .includes('venice');
  const providerModelApiBase = usingVenice
    ? (env.BOSSRAID_VENICE_API_BASE ?? env.VENICE_API_BASE ?? 'https://api.venice.ai/api/v1')
    : env.BOSSRAID_MODEL_API_BASE;
  const providerModel = usingVenice
    ? (env.BOSSRAID_VENICE_MODEL ?? env.VENICE_MODEL ?? 'minimax-m27')
    : (env.BOSSRAID_MODEL ?? profile.modelId ?? 'gpt-5.5');

  return {
    keyEnv,
    providerModelApiKey,
    usingVenice,
    providerModelApiBase,
    providerModel,
  };
}

export function buildProviderChildEnv(profile, index, inheritedEnv, options = {}) {
  const endpoint = new URL(profile.endpoint);
  const mode = inferProviderMode(profile);
  const { providerModelApiKey, providerModelApiBase, providerModel } = resolveProviderModelConfig(
    profile,
    mode,
    inheritedEnv
  );
  const providerStubMode =
    inheritedEnv.BOSSRAID_PROVIDER_STUB_MODE === '1' ||
    inheritedEnv.BOSSRAID_PROVIDER_STUB_MODE === 'true' ||
    inheritedEnv.BOSSRAID_PROVIDER_STUB_MODE === 'yes';
  const useStubMode =
    options.forceStubMode ??
    (providerStubMode || (!providerModelApiKey && !inheritedEnv.BOSSRAID_MODEL_API_KEY));

  const env = {
    ...inheritedEnv,
    PORT: String(endpoint.port || 9001 + index),
    BOSSRAID_PROVIDER_ID: profile.providerId,
    BOSSRAID_PROVIDER_NAME: profile.displayName,
    BOSSRAID_PROVIDER_TOKEN: profile.auth?.token ?? inheritedEnv.BOSSRAID_PROVIDER_TOKEN,
    BOSSRAID_CALLBACK_TOKEN:
      profile.auth?.token ??
      inheritedEnv.BOSSRAID_CALLBACK_TOKEN ??
      inheritedEnv.BOSSRAID_PROVIDER_TOKEN,
    BOSSRAID_PROVIDER_AUTH_TYPE: profile.auth?.type ?? inheritedEnv.BOSSRAID_PROVIDER_AUTH_TYPE,
    BOSSRAID_PROVIDER_INSTRUCTIONS: buildProviderInstructions(profile, mode),
    BOSSRAID_PROVIDER_MODE: mode,
    BOSSRAID_MODEL_API_KEY: providerModelApiKey ?? inheritedEnv.BOSSRAID_MODEL_API_KEY,
    BOSSRAID_MODEL: providerModel,
    BOSSRAID_MODEL_API_BASE: providerModelApiBase,
    BOSSRAID_MODEL_REASONING_EFFORT:
      inheritedEnv.BOSSRAID_MODEL_REASONING_EFFORT ??
      inheritedEnv.VENICE_REASONING_EFFORT ??
      'medium',
  };

  if (options.includePrivacyFeatures) {
    env.BOSSRAID_PROVIDER_PRIVACY_FEATURES = resolvePrivacyFeatures(profile);
  }

  if (options.includeStubMode) {
    env.BOSSRAID_PROVIDER_STUB_MODE = useStubMode
      ? 'true'
      : inheritedEnv.BOSSRAID_PROVIDER_STUB_MODE;
  }

  if (options.includeCallbackBase) {
    env.BOSSRAID_CALLBACK_BASE =
      inheritedEnv.BOSSRAID_CALLBACK_BASE ??
      inheritedEnv.BOSSRAID_API_BASE ??
      `http://127.0.0.1:${inheritedEnv.BOSSRAID_API_PORT ?? '8787'}`;
  }

  return env;
}

export function attachProviderShutdown(children, options = {}) {
  const killChild = options.killProcessTree ?? ((child) => child.kill('SIGTERM'));
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[providers] shutting down on ${signal}`);
    for (const child of children) {
      killChild(child, 'SIGTERM');
    }
    setTimeout(() => {
      for (const child of children) {
        killChild(child, 'SIGKILL');
      }
      process.exit(0);
    }, 1000);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
