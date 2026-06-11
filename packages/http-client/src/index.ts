function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export type JsonResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  headers: Record<string, string>;
};

export type FetchJsonOptions = {
  credentials?: RequestCredentials;
};

export function parseJsonErrorMessage(
  payload: { message?: string; error?: string },
  status: number
): string {
  if (typeof payload.message === 'string' && payload.message.length > 0) {
    return payload.message;
  }
  if (typeof payload.error === 'string' && payload.error.length > 0) {
    return payload.error;
  }
  return `Request failed: ${status}`;
}

export function createFetchJson(apiBase: string, options: FetchJsonOptions = {}) {
  return async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: options.credentials,
      ...init,
    });
    if (!response.ok) {
      let message = `Request failed: ${response.status}`;

      try {
        const payload = (await response.json()) as { message?: string; error?: string };
        message = parseJsonErrorMessage(payload, response.status);
      } catch {
        // Ignore parse errors and keep the status-based message.
      }

      throw new Error(message);
    }
    return response.json() as Promise<T>;
  };
}

export function formatActionTimeoutMs(timeoutMs: number): string {
  if (timeoutMs < 1_000) {
    return `${timeoutMs}ms`;
  }

  return `${(timeoutMs / 1_000).toFixed(timeoutMs >= 10_000 ? 0 : 1)}s`;
}

export async function requestJsonDetailed<T>(
  apiBase: string,
  path: string,
  init?: RequestInit,
  timeoutMs = 0
): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timeoutId =
    timeoutMs > 0 ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
    const headers = headersToRecord(response.headers);
    const text = await response.text();

    let data: T | undefined;
    let error: string | undefined;

    if (text.length > 0) {
      try {
        const parsed = JSON.parse(text) as T | { message?: string; error?: string };
        if (response.ok) {
          data = parsed as T;
        } else {
          error = parseJsonErrorMessage(
            parsed as { message?: string; error?: string },
            response.status
          );
          data = parsed as T;
        }
      } catch {
        if (!response.ok) {
          error = text;
        }
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: error ?? (response.ok ? undefined : `Request failed: ${response.status}`),
      headers,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        status: 0,
        error: `Request timed out after ${formatActionTimeoutMs(timeoutMs)}.`,
        headers: {},
      };
    }

    throw error;
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}
