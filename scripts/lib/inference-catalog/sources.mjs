import { createHash } from 'node:crypto';

export const SOURCE_URLS = {
  models: 'https://models.dev/models.json',
  providers: 'https://models.dev/api.json',
  venice: 'https://api.venice.ai/api/v1/models',
  redpill: 'https://api.redpill.ai/v1/models',
  near: 'https://cloud-api.near.ai/v1/models',
  chutes: 'https://llm.chutes.ai/v1/models',
  phala: 'https://service.redpill.ai/api/models',
  darkbloom: 'https://api.darkbloom.dev/v1/models/catalog',
};

export function validateSource(key, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${key}: expected a JSON object`);
  }
  const rows =
    key === 'models' || key === 'providers'
      ? Object.values(payload)
      : (payload.data ?? payload.models);
  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    rows.some((r) => !r || typeof r.id !== 'string')
  ) {
    throw new Error(`${key}: empty or invalid model list`);
  }
  if (
    key === 'providers' &&
    rows.some(
      (r) =>
        !r.models ||
        typeof r.models !== 'object' ||
        Array.isArray(r.models) ||
        Object.values(r.models).some((m) => !m || typeof m.id !== 'string')
    )
  ) {
    throw new Error('models.dev: invalid provider model map');
  }
}

/** Fetch public metadata only. Never send platform or seller credentials to catalog sources. */
export async function refreshSources(previous, providerAliases, fetchFn = fetch) {
  const results = await Promise.all(
    Object.entries(SOURCE_URLS).map(async ([key, url]) => {
      const prior = previous[key];
      try {
        const response = await fetchFn(url, {
          headers: {
            accept: 'application/json',
            ...(prior?.etag ? { 'if-none-match': prior.etag } : {}),
          },
          signal: AbortSignal.timeout(20_000),
        });
        const checkedAt = new Date().toISOString();
        if (response.status === 304 && prior)
          return [key, { ...prior, checkedAt, error: undefined }];
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let payload = await response.json();
        validateSource(key, payload);
        if (key === 'providers') {
          for (const id of Object.values(providerAliases)) {
            if (!payload[id] || Object.keys(payload[id].models).length === 0)
              throw new Error(`models.dev: missing provider ${id}`);
          }
          payload = Object.fromEntries(
            [...new Set(Object.values(providerAliases))]
              .filter((id) => payload[id])
              .sort()
              .map((id) => [id, payload[id]])
          );
        }
        return [
          key,
          {
            url,
            fetchedAt: checkedAt,
            checkedAt,
            etag: response.headers.get('etag') ?? undefined,
            sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
            payload,
          },
        ];
      } catch (error) {
        if (!prior) throw new Error(`${key}: no saved snapshot (${error.message})`);
        validateSource(key, prior.payload);
        console.warn(
          `[catalog] ${key}: ${error.message}; retaining snapshot from ${prior.fetchedAt}`
        );
        return [key, { ...prior, error: error.message }];
      }
    })
  );
  return Object.fromEntries(results);
}
