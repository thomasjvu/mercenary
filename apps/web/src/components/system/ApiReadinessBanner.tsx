import useSWR from 'swr';
import { fetchReady } from '../../api/health.js';
import {
  buildApiReadinessHint,
  isLocalDevHost,
  readApiErrorMessage,
} from '../../lib/api-readiness.js';

type ApiReadinessBannerProps = {
  error?: unknown;
  label?: string;
};

export function ApiReadinessBanner({ error, label = 'API unavailable' }: ApiReadinessBannerProps) {
  const ready = useSWR('api-ready-banner', fetchReady, {
    refreshInterval: 15_000,
    shouldRetryOnError: false,
  });

  if (!error && ready.data?.ok) {
    return null;
  }

  const message = error ? readApiErrorMessage(error) : readApiErrorMessage(ready.error);
  const hint = error
    ? buildApiReadinessHint(error)
    : isLocalDevHost()
      ? 'Start the API with pnpm dev or pnpm dev:api, then reload.'
      : buildApiReadinessHint(ready.error);

  return (
    <aside className="api-readiness-banner" role="status">
      <p className="eyebrow">{label}</p>
      <p>{message}</p>
      <p className="api-readiness-banner__hint">{hint}</p>
    </aside>
  );
}
