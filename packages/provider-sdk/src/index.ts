import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { refreshProviderScores } from "@bossraid/provider-registry";
import type {
  ProviderAcceptance,
  ProviderAuthConfig,
  ProviderHealthStatus,
  ProviderHeartbeat,
  ProviderProfile,
  ProviderRegistrationInput,
  ProviderSubmission,
  ProviderTaskPackage,
} from "@bossraid/shared-types";

const HMAC_TIMESTAMP_MAX_SKEW_MS = 5 * 60_000;
const DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS = 5_000;

export interface RaidProvider {
  readonly profile: ProviderProfile;
  accept(task: ProviderTaskPackage): Promise<ProviderAcceptance>;
  run(
    task: ProviderTaskPackage,
    callbacks: {
      onHeartbeat: (heartbeat: ProviderHeartbeat) => Promise<void> | void;
      onSubmit: (submission: ProviderSubmission) => Promise<void> | void;
      onFailure: (error: Error) => Promise<void> | void;
    },
  ): Promise<void>;
}

export function normalizeRequestPath(path: string): string {
  try {
    return new URL(path, "http://bossraid.local").pathname;
  } catch {
    const queryIndex = path.indexOf("?");
    return queryIndex >= 0 ? path.slice(0, queryIndex) : path;
  }
}

export function buildProviderAuthHeaders(
  auth: ProviderAuthConfig | undefined,
  providerId: string,
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const canonicalPath = normalizeRequestPath(path);
  if (!auth || auth.type === "none") {
    return {};
  }

  if (auth.type === "bearer") {
    if (!auth.token) {
      throw new Error("Bearer provider auth requires a token.");
    }
    return {
      [auth.headerName ?? "authorization"]: `Bearer ${auth.token}`,
    };
  }

  if (auth.type === "hmac") {
    if (!auth.secret) {
      throw new Error("HMAC provider auth requires a secret.");
    }
    const timestamp = new Date().toISOString();
    const signature = createHmac("sha256", auth.secret)
      .update(`${method.toUpperCase()} ${canonicalPath}\n${timestamp}\n${body}`)
      .digest("hex");

    return {
      "x-bossraid-timestamp": timestamp,
      "x-bossraid-signature": signature,
      "x-bossraid-provider-id": providerId,
    };
  }

  return {};
}

export function verifyProviderAuth(input: {
  auth: ProviderAuthConfig | undefined;
  providerId: string;
  method: string;
  path: string;
  body: string;
  headers?: Record<string, string | string[] | undefined>;
  authorizationHeader?: string;
  timestampHeader?: string;
  signatureHeader?: string;
  providerIdHeader?: string;
  nowMs?: number;
}): boolean {
  const { auth } = input;
  const canonicalPath = normalizeRequestPath(input.path);
  if (!auth || auth.type === "none") {
    return true;
  }

  if (auth.type === "bearer" && auth.token) {
    const headerName = (auth.headerName ?? "authorization").toLowerCase();
    const headerValue =
      headerName === "authorization"
        ? input.authorizationHeader
        : Array.isArray(input.headers?.[headerName])
          ? input.headers?.[headerName]?.[0]
          : input.headers?.[headerName];
    return headerValue === `Bearer ${auth.token}`;
  }

  if (auth.type === "hmac" && auth.secret) {
    if (!input.timestampHeader || !input.signatureHeader || !input.providerIdHeader) {
      return false;
    }
    if (input.providerIdHeader !== input.providerId) {
      return false;
    }
    if (!timestampIsFresh(input.timestampHeader, input.nowMs)) {
      return false;
    }

    const expected = createHmac("sha256", auth.secret)
      .update(`${input.method.toUpperCase()} ${canonicalPath}\n${input.timestampHeader}\n${input.body}`)
      .digest("hex");

    return safeEqualHex(expected, input.signatureHeader);
  }

  return false;
}

function safeEqualHex(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function timestampIsFresh(timestamp: string, nowMs: number = Date.now()): boolean {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return Math.abs(nowMs - parsed) <= HMAC_TIMESTAMP_MAX_SKEW_MS;
}

async function postJson<TResponse>(
  profile: ProviderProfile,
  path: string,
  payload: unknown,
): Promise<TResponse> {
  const body = JSON.stringify(payload);
  const url = new URL(path, profile.endpoint).toString();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = 9_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  console.info(`[provider-http] ${profile.providerId} POST ${path} start`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildProviderAuthHeaders(profile.auth, profile.providerId, "POST", path, body),
      },
      body,
      signal: controller.signal,
    });

    console.info(
      `[provider-http] ${profile.providerId} POST ${path} status=${response.status} elapsed_ms=${Date.now() - startedAt}`,
    );

    if (!response.ok) {
      throw new Error(`${profile.providerId} request failed: ${response.status}`);
    }

    return response.json() as Promise<TResponse>;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `${profile.providerId} request timed out after ${timeoutMs} ms`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(
      `[provider-http] ${profile.providerId} POST ${path} failed elapsed_ms=${Date.now() - startedAt} error=${message}`,
    );
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeProviderHealth(profile: ProviderProfile): Promise<ProviderHealthStatus> {
  const controller = new AbortController();
  const timeoutMs = readProviderHealthTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL("/health", profile.endpoint).toString(), {
      method: "GET",
      signal: controller.signal,
    });

    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    return {
      providerId: profile.providerId,
      providerName: typeof payload.providerName === "string" ? payload.providerName : profile.displayName,
      endpoint: profile.endpoint,
      reachable: response.ok,
      ready: response.ok && payload.ready === true,
      statusCode: response.status,
      missing: Array.isArray(payload.missing)
        ? payload.missing.filter((item): item is string => typeof item === "string")
        : undefined,
      model: typeof payload.model === "string" || payload.model === null ? (payload.model as string | null) : undefined,
      modelApiBase: typeof payload.modelApiBase === "string" ? payload.modelApiBase : undefined,
      error: response.ok ? undefined : `health check failed (${response.status})`,
    };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("timed out"));
    return {
      providerId: profile.providerId,
      providerName: profile.displayName,
      endpoint: profile.endpoint,
      reachable: false,
      ready: false,
      error:
        timedOut
          ? `health check timed out after ${timeoutMs} ms`
          : error instanceof Error
            ? error.message
            : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readProviderHealthTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BOSSRAID_PROVIDER_HEALTH_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROVIDER_HEALTH_TIMEOUT_MS;
}

export class HttpRaidProvider implements RaidProvider {
  readonly profile: ProviderProfile;

  constructor(profile: ProviderProfile) {
    this.profile = profile;
  }

  async accept(task: ProviderTaskPackage): Promise<ProviderAcceptance> {
    return postJson<ProviderAcceptance>(this.profile, "/v1/raid/accept", {
      raidId: task.raidId,
      providerId: this.profile.providerId,
      task,
      deadlineUnix: task.deadlineUnix,
    });
  }

  async run(
    _task: ProviderTaskPackage,
    _callbacks: {
      onHeartbeat: (heartbeat: ProviderHeartbeat) => Promise<void> | void;
      onSubmit: (submission: ProviderSubmission) => Promise<void> | void;
      onFailure: (error: Error) => Promise<void> | void;
    },
  ): Promise<void> {
    return;
  }
}

export async function loadProviderProfilesFromFile(path: string): Promise<ProviderProfile[]> {
  const raw = await readFile(path, "utf8");
  const expanded = expandEnvPlaceholders(raw);
  return (JSON.parse(expanded) as ProviderProfile[]).map((profile) => normalizeProviderProfile(profile));
}

export function createProvidersFromProfiles(profiles: ProviderProfile[]): RaidProvider[] {
  return profiles.map((profile) => createProviderFromProfile(profile));
}

export function createProviderFromProfile(profile: ProviderProfile): RaidProvider {
  const normalized = normalizeProviderProfile(profile);
  if (profile.endpointType !== "http") {
    throw new Error(
      `Unsupported provider endpointType "${profile.endpointType}" for ${profile.providerId}. Configure an HTTP provider.`,
    );
  }

  return new HttpRaidProvider(normalized);
}

export function buildProviderProfileFromRegistration(
  input: ProviderRegistrationInput,
  existing?: ProviderProfile,
): ProviderProfile {
  return normalizeProviderProfile({
    providerId: input.agentId,
    agentId: input.agentId,
    displayName: input.name,
    description: input.description ?? existing?.description,
    endpointType: "http",
    endpoint: input.endpoint,
    specializations: input.capabilities ?? existing?.specializations ?? [],
    supportedLanguages: input.supportedLanguages ?? existing?.supportedLanguages ?? ["typescript"],
    supportedFrameworks: input.supportedFrameworks ?? existing?.supportedFrameworks ?? [],
    outputTypes: input.outputTypes ?? existing?.outputTypes ?? [],
    modelFamily: input.modelFamily ?? existing?.modelFamily,
    pricePerTaskUsd: input.pricing?.pricePerTaskUsd ?? existing?.pricePerTaskUsd ?? 1,
    maxConcurrency: existing?.maxConcurrency ?? 1,
    status: existing?.status ?? "available",
    privacy: {
      ...existing?.privacy,
      ...input.privacy,
    },
    erc8004: (() => {
      const merged = existing?.erc8004 || input.erc8004
        ? {
            ...existing?.erc8004,
            ...input.erc8004,
          }
        : undefined;
      const agentId = merged?.agentId;
      if (!agentId) {
        return undefined;
      }
      return {
        agentId,
        operatorWallet: merged.operatorWallet,
        registrationTx: merged.registrationTx,
        identityRegistry: merged.identityRegistry,
        reputationRegistry: merged.reputationRegistry,
        validationRegistry: merged.validationRegistry,
        validationTxs: merged.validationTxs,
        lastVerifiedAt: merged.lastVerifiedAt,
        verification: merged.verification,
      };
    })(),
    trust:
      existing?.trust || input.trust
        ? {
            ...existing?.trust,
            ...input.trust,
          }
        : undefined,
    reputation: {
      globalScore: input.reputation?.globalScore ?? existing?.reputation?.globalScore ?? 0.5,
      responsivenessScore:
        input.reputation?.responsivenessScore ?? existing?.reputation?.responsivenessScore ?? 0.5,
      validityScore: input.reputation?.validityScore ?? existing?.reputation?.validityScore ?? 0.5,
      qualityScore: input.reputation?.qualityScore ?? existing?.reputation?.qualityScore ?? 0.5,
      timeoutRate: input.reputation?.timeoutRate ?? existing?.reputation?.timeoutRate ?? 0,
      duplicateRate: input.reputation?.duplicateRate ?? existing?.reputation?.duplicateRate ?? 0,
      specializationScores:
        input.reputation?.specializationScores ?? existing?.reputation?.specializationScores ?? {},
      p50LatencyMs: input.reputation?.p50LatencyMs ?? existing?.reputation?.p50LatencyMs ?? 5_000,
      p95LatencyMs: input.reputation?.p95LatencyMs ?? existing?.reputation?.p95LatencyMs ?? 10_000,
      totalRaids: input.reputation?.totalRaids ?? existing?.reputation?.totalRaids ?? 0,
      totalSuccessfulRaids:
        input.reputation?.totalSuccessfulRaids ?? existing?.reputation?.totalSuccessfulRaids ?? 0,
    },
    scores: existing?.scores,
    lastSeenAt: existing?.lastSeenAt ?? new Date().toISOString(),
    auth: input.auth ?? existing?.auth,
  });
}

export function normalizeProviderProfile(profile: ProviderProfile): ProviderProfile {
  const normalized: ProviderProfile = {
    ...profile,
    agentId: profile.agentId ?? profile.providerId,
    specializations: profile.specializations ?? [],
    supportedLanguages: profile.supportedLanguages ?? [],
    supportedFrameworks: profile.supportedFrameworks ?? [],
    outputTypes: profile.outputTypes ?? [],
    privacy: profile.privacy ?? {},
    erc8004: profile.erc8004 == null
      ? undefined
      : {
          ...profile.erc8004,
          validationTxs: profile.erc8004.validationTxs ?? [],
        },
    trust: profile.trust == null ? undefined : { ...profile.trust },
    reputation: {
      globalScore: profile.reputation?.globalScore ?? 0.5,
      responsivenessScore: profile.reputation?.responsivenessScore ?? 0.5,
      validityScore: profile.reputation?.validityScore ?? 0.5,
      qualityScore: profile.reputation?.qualityScore ?? 0.5,
      timeoutRate: profile.reputation?.timeoutRate ?? 0,
      duplicateRate: profile.reputation?.duplicateRate ?? 0,
      specializationScores: profile.reputation?.specializationScores ?? {},
      p50LatencyMs: profile.reputation?.p50LatencyMs ?? 5_000,
      p95LatencyMs: profile.reputation?.p95LatencyMs ?? 10_000,
      totalRaids: profile.reputation?.totalRaids ?? 0,
      totalSuccessfulRaids: profile.reputation?.totalSuccessfulRaids ?? 0,
    },
    lastSeenAt: profile.lastSeenAt ?? new Date().toISOString(),
  };

  return refreshProviderScores(normalized);
}

function expandEnvPlaceholders(raw: string, env: NodeJS.ProcessEnv = process.env): string {
  return raw.replace(/\$\{([A-Z0-9_]+)(?::-(.*?))?\}/g, (_match, name: string, fallback: string | undefined) => {
    const value = env[name];
    if (value != null) {
      return value;
    }
    if (fallback != null) {
      return fallback;
    }
    throw new Error(`Missing environment variable ${name} for provider config template.`);
  });
}
