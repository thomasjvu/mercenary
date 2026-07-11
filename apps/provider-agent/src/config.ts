type ProviderAgentAuthType = 'bearer' | 'hmac' | 'none';
type ProviderMode = 'generic' | 'gbstudio' | 'pixel_art' | 'remotion';

function readBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

import { NETWORK } from '@bossraid/constants';
import {
  buildHarnessProfile,
  defaultModelBaseForHarness,
  defaultModelNameForHarness,
  frameworkForHarness,
  normalizeHarnessKind,
  parseHarnessSkills,
  planProviderForHarness,
  resolveInstallation,
  type HarnessRuntimeConfig,
} from './harness/index.js';

function normalizeAuthType(value: string, envKey: string): ProviderAgentAuthType {
  if (value === 'bearer' || value === 'hmac' || value === 'none') {
    return value;
  }
  throw new Error(`${envKey} must be bearer, hmac, or none.`);
}

function resolveAuthType(
  explicitValue: string | undefined,
  token: string | undefined,
  secret: string | undefined,
  envKey: string
): ProviderAgentAuthType {
  if (explicitValue) {
    return normalizeAuthType(explicitValue, envKey);
  }
  if (secret) {
    return 'hmac';
  }
  if (token) {
    return 'bearer';
  }
  return 'none';
}

function normalizeProviderMode(value: string | undefined): ProviderMode {
  if (!value) {
    return 'generic';
  }

  if (
    value === 'generic' ||
    value === 'gbstudio' ||
    value === 'pixel_art' ||
    value === 'remotion'
  ) {
    return value;
  }

  throw new Error('BOSSRAID_PROVIDER_MODE must be generic, gbstudio, pixel_art, or remotion.');
}

function validateAuthConfig(
  label: 'Provider ingress' | 'Callback',
  auth: {
    type: ProviderAgentAuthType;
    token?: string;
    secret?: string;
  },
  allowInsecureAuth: boolean
): void {
  if (auth.type === 'none') {
    if (!allowInsecureAuth) {
      throw new Error(
        `${label} auth must be configured. Set bearer or hmac credentials, or explicitly opt into insecure local development with BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH=1.`
      );
    }
    return;
  }

  if (auth.type === 'bearer' && !auth.token) {
    throw new Error(`${label} bearer auth requires a token.`);
  }

  if (auth.type === 'hmac' && !auth.secret) {
    throw new Error(`${label} hmac auth requires a secret.`);
  }
}

export function buildProviderConfig(env: NodeJS.ProcessEnv = process.env) {
  const allowInsecureAuth = readBoolean(env.BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH);
  const providerAuth = {
    type: resolveAuthType(
      env.BOSSRAID_PROVIDER_AUTH_TYPE,
      env.BOSSRAID_PROVIDER_TOKEN,
      env.BOSSRAID_PROVIDER_SECRET,
      'BOSSRAID_PROVIDER_AUTH_TYPE'
    ),
    token: env.BOSSRAID_PROVIDER_TOKEN,
    secret: env.BOSSRAID_PROVIDER_SECRET,
  } as const;
  const callbackAuth = {
    type: resolveAuthType(
      env.BOSSRAID_CALLBACK_AUTH_TYPE,
      env.BOSSRAID_CALLBACK_TOKEN ?? env.BOSSRAID_PROVIDER_TOKEN,
      env.BOSSRAID_CALLBACK_SECRET,
      'BOSSRAID_CALLBACK_AUTH_TYPE'
    ),
    token: env.BOSSRAID_CALLBACK_TOKEN ?? env.BOSSRAID_PROVIDER_TOKEN,
    secret: env.BOSSRAID_CALLBACK_SECRET,
  } as const;

  validateAuthConfig('Provider ingress', providerAuth, allowInsecureAuth);
  validateAuthConfig('Callback', callbackAuth, allowInsecureAuth);

  const harnessKind = normalizeHarnessKind(env.BOSSRAID_HARNESS_MODE);
  const harnessSkills = parseHarnessSkills(env.BOSSRAID_HARNESS_SKILLS);
  const modelApiBase = env.BOSSRAID_MODEL_API_BASE ?? defaultModelBaseForHarness(harnessKind);
  const defaultModelName = defaultModelNameForHarness(harnessKind);
  const modelName =
    env.BOSSRAID_MODEL ??
    (readBoolean(env.BOSSRAID_PROVIDER_STUB_MODE)
      ? (defaultModelName ?? 'gpt-5.5')
      : defaultModelName);

  const harness: HarnessRuntimeConfig = {
    kind: harnessKind,
    installation: resolveInstallation(harnessSkills),
    skills: harnessSkills,
    imageDigest: env.BOSSRAID_HARNESS_IMAGE_DIGEST?.trim() || undefined,
    modelId: modelName,
    modelApiBase,
    planProvider: env.BOSSRAID_HARNESS_PLAN_PROVIDER ?? planProviderForHarness(harnessKind),
    maxSteps: Math.max(1, Math.min(32, Number(env.BOSSRAID_HARNESS_MAX_STEPS ?? '10'))),
    allowShell: readBoolean(env.BOSSRAID_HARNESS_ALLOW_SHELL),
  };
  const harnessProfile = buildHarnessProfile(harness);

  return {
    providerId: env.BOSSRAID_PROVIDER_ID ?? 'provider-agent',
    displayName: env.BOSSRAID_PROVIDER_NAME ?? 'Provider Agent',
    callbackBase:
      env.BOSSRAID_CALLBACK_BASE ?? `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_API_PORT}`,
    port: Number(env.PORT ?? NETWORK.LOCAL_PROVIDER_BASE_PORT.toString()),
    acceptDelayMs: Number(env.BOSSRAID_ACCEPT_DELAY_MS ?? '250'),
    heartbeatIntervalMs: Number(env.BOSSRAID_HEARTBEAT_INTERVAL_MS ?? '1500'),
    providerInstructions:
      env.BOSSRAID_PROVIDER_INSTRUCTIONS ??
      'You are a specialist patch author. Return the smallest correct unified diff that addresses the reported issue without touching unrelated code.',
    stubMode: readBoolean(env.BOSSRAID_PROVIDER_STUB_MODE),
    modelApiBase,
    modelApiKey: env.BOSSRAID_MODEL_API_KEY,
    modelName,
    modelReasoningEffort: env.BOSSRAID_MODEL_REASONING_EFFORT ?? 'medium',
    modelTimeoutMs: Number(env.BOSSRAID_MODEL_TIMEOUT_MS ?? '45000'),
    maxOutputTokens: Number(env.BOSSRAID_MAX_OUTPUT_TOKENS ?? '2200'),
    providerMode: normalizeProviderMode(env.BOSSRAID_PROVIDER_MODE),
    agentFramework: env.BOSSRAID_AGENT_FRAMEWORK ?? frameworkForHarness(harnessKind) ?? 'custom',
    modelProvider: env.BOSSRAID_MODEL_PROVIDER ?? planProviderForHarness(harnessKind),
    harness,
    harnessProfile,
    providerAuth,
    callbackAuth,
    privacyFeatures: (() => {
      const raw = env.BOSSRAID_PROVIDER_PRIVACY_FEATURES;
      if (!raw) return ['tee_attested'] as const;
      return raw
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean) as readonly string[];
    })(),
    teeSocketPath: env.BOSSRAID_TEE_SOCKET_PATH,
  };
}

export type ProviderConfig = ReturnType<typeof buildProviderConfig>;

let cachedProviderConfig: ProviderConfig | undefined;

export function getProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  if (env !== process.env) {
    return buildProviderConfig(env);
  }

  cachedProviderConfig ??= buildProviderConfig(env);
  return cachedProviderConfig;
}

export function resetProviderConfigForTests(): void {
  cachedProviderConfig = undefined;
}

export const providerConfig = new Proxy({} as ProviderConfig, {
  get(_target, property, receiver) {
    return Reflect.get(getProviderConfig(), property, receiver);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Object.getOwnPropertyDescriptor(getProviderConfig(), property);
  },
  has(_target, property) {
    return property in getProviderConfig();
  },
  ownKeys() {
    return Reflect.ownKeys(getProviderConfig());
  },
});

export function getReadiness(): { ready: boolean; missing: string[] } {
  const config = getProviderConfig();
  const missing: string[] = [];
  if (!config.stubMode && !config.modelApiKey) {
    missing.push('BOSSRAID_MODEL_API_KEY');
  }
  if (!config.modelName) {
    missing.push('BOSSRAID_MODEL');
  }
  return {
    ready: missing.length === 0,
    missing,
  };
}
