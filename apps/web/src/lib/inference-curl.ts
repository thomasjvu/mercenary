export type InferenceCurlOptions = {
  apiBase: string;
  model: string;
  prompt?: string;
  stream?: boolean;
  maxBudgetUsd?: number | string;
  privacyMode?: 'off' | 'prefer' | 'strict';
  apiKey?: string;
  strictE2ee?: boolean;
  includeAuth?: boolean;
  relativePath?: boolean;
};

function escapeJsonString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatApiBase(apiBase: string, relativePath = false): string {
  if (relativePath || !apiBase.startsWith('http')) {
    return apiBase.replace(/\/$/, '');
  }

  return apiBase.replace(/\/$/, '');
}

export function buildInferenceCurlSnippet(options: InferenceCurlOptions): string {
  const apiBase = formatApiBase(options.apiBase, options.relativePath);
  const model = options.model;
  const prompt = escapeJsonString(options.prompt ?? 'Use the cheapest verified seller.');
  const privacyMode = options.privacyMode ?? 'prefer';
  const headers: string[] = ['  -H "content-type: application/json" \\'];
  const includeAuth = options.includeAuth ?? true;

  if (options.strictE2ee) {
    headers.unshift('  -H "x-bossraid-upstream-api-key: vn_..." \\');
  } else if (includeAuth) {
    headers.unshift(`  -H "authorization: Bearer ${options.apiKey ?? 'br_...'}" \\`);
  }

  const raidPolicy =
    options.strictE2ee || privacyMode === 'strict'
      ? `{"privacy_mode":"strict"}`
      : `{"max_total_cost":${options.maxBudgetUsd ?? 1},"privacy_mode":"${privacyMode}"}`;

  const payloadParts = [
    `"model":"${model}"`,
    ...(options.stream ? ['"stream":true'] : []),
    `"messages":[{"role":"user","content":"${prompt}"}]`,
    `"raid_policy":${raidPolicy}`,
  ];
  const payload = `{${payloadParts.join(',')}}`;

  return [
    `curl -X POST ${apiBase}/v1/inference/chat/completions \\`,
    ...headers,
    `  -d '${payload}'`,
  ].join('\n');
}

export function resolvePublicApiBase(
  configuredBase: string | undefined,
  fallback = '$BOSSRAID_API_BASE'
): string {
  const raw = (configuredBase ?? fallback).trim();
  if (!raw) {
    return fallback;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/$/, '');
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
}
