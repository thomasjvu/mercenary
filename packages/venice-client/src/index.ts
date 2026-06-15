const DEFAULT_VENICE_API_BASE = 'https://api.venice.ai/api/v1';
const DEFAULT_VENICE_TIMEOUT_MS = 20_000;
const DEFAULT_MODEL = 'kimi-k2-5';

export interface VeniceClientConfig {
  apiBase?: string;
  apiKey?: string;
  walletKey?: `0x${string}`;
  model?: string;
  timeoutMs?: number;
}

export interface VeniceChatResult {
  content: string;
  balanceRemainingUsd?: number;
  model: string;
}

export interface VeniceImageResult {
  artifacts: Array<{
    outputType: 'image';
    label: string;
    uri: string;
    mimeType?: string;
    description?: string;
  }>;
  balanceRemainingUsd?: number;
  model: string;
}

function readBalanceRemaining(headers: Headers): number | undefined {
  const value = headers.get('X-Balance-Remaining');
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function veniceFetch(
  config: VeniceClientConfig,
  path: string,
  init: RequestInit
): Promise<Response> {
  const apiBase = config.apiBase ?? DEFAULT_VENICE_API_BASE;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? DEFAULT_VENICE_TIMEOUT_MS
  );

  try {
    const headers = new Headers(init.headers ?? {});
    headers.set('content-type', 'application/json');
    if (config.apiKey) {
      headers.set('authorization', `Bearer ${config.apiKey}`);
    }

    return await fetch(new URL(path.replace(/^\/+/, ''), `${apiBase}/`).toString(), {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class VeniceRaidClient {
  private readonly config: VeniceClientConfig;

  constructor(config: VeniceClientConfig = {}) {
    this.config = {
      apiBase: config.apiBase ?? process.env.BOSSRAID_VENICE_API_BASE ?? DEFAULT_VENICE_API_BASE,
      apiKey: config.apiKey ?? process.env.BOSSRAID_VENICE_API_KEY,
      walletKey:
        config.walletKey ?? (process.env.BOSSRAID_VENICE_WALLET_KEY as `0x${string}` | undefined),
      model: config.model ?? process.env.BOSSRAID_VENICE_MODEL ?? DEFAULT_MODEL,
      timeoutMs: config.timeoutMs,
    };
  }

  enabled(): boolean {
    return Boolean(this.config.apiKey || this.config.walletKey);
  }

  async chat(input: { system?: string; user: string; model?: string }): Promise<VeniceChatResult> {
    if (!this.config.apiKey) {
      throw new Error('Venice chat requires BOSSRAID_VENICE_API_KEY or apiKey config.');
    }

    const messages = [
      ...(input.system ? [{ role: 'system' as const, content: input.system }] : []),
      { role: 'user' as const, content: input.user },
    ];
    const model = input.model ?? this.config.model ?? DEFAULT_MODEL;

    const response = await veniceFetch(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Venice chat failed (${response.status}).`);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Venice chat returned an empty response.');
    }

    return {
      content,
      balanceRemainingUsd: readBalanceRemaining(response.headers),
      model,
    };
  }

  async generateImage(input: { prompt: string; model?: string }): Promise<VeniceImageResult> {
    if (!this.config.apiKey) {
      throw new Error('Venice image generation requires BOSSRAID_VENICE_API_KEY or apiKey config.');
    }

    const model = input.model ?? 'fluently-xl';
    const response = await veniceFetch(this.config, '/image/generate', {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        format: 'png',
      }),
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    const payload = (await response.json()) as {
      images?: Array<{ url?: string; b64_json?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? `Venice image generation failed (${response.status}).`
      );
    }

    const image = payload.images?.[0];
    const uri =
      image?.url ?? (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : undefined);

    if (!uri) {
      throw new Error('Venice image generation returned no image payload.');
    }

    return {
      artifacts: [
        {
          outputType: 'image',
          label: 'Venice generated image',
          uri,
          mimeType: 'image/png',
          description: input.prompt.slice(0, 240),
        },
      ],
      balanceRemainingUsd: readBalanceRemaining(response.headers),
      model,
    };
  }
}

export function createVeniceRaidClient(config: VeniceClientConfig = {}): VeniceRaidClient {
  return new VeniceRaidClient(config);
}

export function taskUsesVeniceLane(constraints: {
  allowedModelFamilies?: string[];
  privacyMode?: string;
  requirePrivacyFeatures?: string[];
}): boolean {
  const families = (constraints.allowedModelFamilies ?? []).map((value) => value.toLowerCase());
  if (families.some((value) => value.includes('venice'))) {
    return true;
  }

  return constraints.privacyMode === 'strict';
}
