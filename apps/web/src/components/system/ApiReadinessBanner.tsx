import useSWR from 'swr';
import { fetchReady } from '../../api/health.js';
import {
  buildApiReadinessHint,
  buildProductionOfflineHint,
  buildReadyNotOkMessage,
  isLocalDevHost,
  readApiErrorMessage,
} from '../../lib/api-readiness.js';

type ApiReadinessBannerProps = {
  error?: unknown;
};

export function ApiReadinessBanner({ error }: ApiReadinessBannerProps) {
  const ready = useSWR('api-ready-banner', fetchReady, {
    refreshInterval: 15_000,
    shouldRetryOnError: false,
  });

  const readyData = ready.data;
  const readyFetchFailed = Boolean(ready.error);
  const readyNotOk = readyData?.ok === false;
  const hasPageError = Boolean(error);
  const isLoading = !hasPageError && !readyFetchFailed && readyData === undefined && !ready.error;

  if (isLoading) {
    return null;
  }

  if (!hasPageError && !readyFetchFailed && readyData?.ok) {
    return null;
  }

  const isOffline = hasPageError || readyFetchFailed;
  const message = isOffline
    ? readApiErrorMessage(error ?? ready.error)
    : buildReadyNotOkMessage(readyData?.gates);
  const hint = isOffline
    ? isLocalDevHost()
      ? buildApiReadinessHint(error ?? ready.error)
      : buildProductionOfflineHint()
    : isLocalDevHost()
      ? 'Start the API with pnpm dev or pnpm dev:api, then reload.'
      : buildProductionOfflineHint();

  const headline = isOffline
    ? 'Boss Raid API is currently offline'
    : 'Boss Raid API is partially unavailable';

  return (
    <aside className="api-status-bar" role="status" aria-live="polite">
      <p className="api-status-bar__headline">{headline}</p>
      <p className="api-status-bar__message">{message}</p>
      <p className="api-status-bar__hint">{hint}</p>
    </aside>
  );
}
