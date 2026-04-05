type ProviderAgentAuthType = "bearer" | "hmac" | "none";
type ProviderMode = "generic" | "gbstudio" | "pixel_art" | "remotion";

function readBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function normalizeAuthType(value: string, envKey: string): ProviderAgentAuthType {
  if (value === "bearer" || value === "hmac" || value === "none") {
    return value;
  }
  throw new Error(`${envKey} must be bearer, hmac, or none.`);
}

function resolveAuthType(
  explicitValue: string | undefined,
  token: string | undefined,
  secret: string | undefined,
  envKey: string,
): ProviderAgentAuthType {
  if (explicitValue) {
    return normalizeAuthType(explicitValue, envKey);
  }
  if (secret) {
    return "hmac";
  }
  if (token) {
    return "bearer";
  }
  return "none";
}

function normalizeProviderMode(value: string | undefined): ProviderMode {
  if (!value) {
    return "generic";
  }

  if (value === "generic" || value === "gbstudio" || value === "pixel_art" || value === "remotion") {
    return value;
  }

  throw new Error("BOSSRAID_PROVIDER_MODE must be generic, gbstudio, pixel_art, or remotion.");
}

function validateAuthConfig(
  label: "Provider ingress" | "Callback",
  auth: {
    type: ProviderAgentAuthType;
    token?: string;
    secret?: string;
  },
  allowInsecureAuth: boolean,
): void {
  if (auth.type === "none") {
    if (!allowInsecureAuth) {
      throw new Error(
        `${label} auth must be configured. Set bearer or hmac credentials, or explicitly opt into insecure local development with BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH=1.`,
      );
    }
    return;
  }

  if (auth.type === "bearer" && !auth.token) {
    throw new Error(`${label} bearer auth requires a token.`);
  }

  if (auth.type === "hmac" && !auth.secret) {
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
      "BOSSRAID_PROVIDER_AUTH_TYPE",
    ),
    token: env.BOSSRAID_PROVIDER_TOKEN,
    secret: env.BOSSRAID_PROVIDER_SECRET,
  } as const;
  const callbackAuth = {
    type: resolveAuthType(
      env.BOSSRAID_CALLBACK_AUTH_TYPE,
      env.BOSSRAID_CALLBACK_TOKEN ?? env.BOSSRAID_PROVIDER_TOKEN,
      env.BOSSRAID_CALLBACK_SECRET,
      "BOSSRAID_CALLBACK_AUTH_TYPE",
    ),
    token: env.BOSSRAID_CALLBACK_TOKEN ?? env.BOSSRAID_PROVIDER_TOKEN,
    secret: env.BOSSRAID_CALLBACK_SECRET,
  } as const;

  validateAuthConfig("Provider ingress", providerAuth, allowInsecureAuth);
  validateAuthConfig("Callback", callbackAuth, allowInsecureAuth);

  return {
    providerId: env.BOSSRAID_PROVIDER_ID ?? "provider-agent",
    displayName: env.BOSSRAID_PROVIDER_NAME ?? "Provider Agent",
    callbackBase: env.BOSSRAID_CALLBACK_BASE ?? "http://127.0.0.1:8787",
    port: Number(env.PORT ?? "9001"),
    acceptDelayMs: Number(env.BOSSRAID_ACCEPT_DELAY_MS ?? "250"),
    heartbeatIntervalMs: Number(env.BOSSRAID_HEARTBEAT_INTERVAL_MS ?? "1500"),
    providerInstructions:
      env.BOSSRAID_PROVIDER_INSTRUCTIONS ??
      "You are a specialist patch author. Return the smallest correct unified diff that addresses the reported issue without touching unrelated code.",
    modelApiBase: env.BOSSRAID_MODEL_API_BASE ?? "https://api.openai.com/v1",
    modelApiKey: env.BOSSRAID_MODEL_API_KEY,
    modelName: env.BOSSRAID_MODEL,
    modelReasoningEffort: env.BOSSRAID_MODEL_REASONING_EFFORT ?? "medium",
    modelTimeoutMs: Number(env.BOSSRAID_MODEL_TIMEOUT_MS ?? "45000"),
    maxOutputTokens: Number(env.BOSSRAID_MAX_OUTPUT_TOKENS ?? "2200"),
    providerMode: normalizeProviderMode(env.BOSSRAID_PROVIDER_MODE),
    providerAuth,
    callbackAuth,
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
  if (!config.modelApiKey) {
    missing.push("BOSSRAID_MODEL_API_KEY");
  }
  if (!config.modelName) {
    missing.push("BOSSRAID_MODEL");
  }
  return {
    ready: missing.length === 0,
    missing,
  };
}
