import { buildApiUrl } from './client.js';
import type { ChatCompletionResponse } from './raid.js';

export async function requestPaidChatCompletion(
  fetchWithPayment: typeof fetch,
  payload: unknown,
  apiBase: string
): Promise<ChatCompletionResponse> {
  const response = await fetchWithPayment(buildApiUrl('/v1/chat/completions', apiBase), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text.length > 0 ? (JSON.parse(text) as ChatCompletionResponse) : undefined;

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Paid chat completion failed (${response.status}).`;
    throw new Error(message);
  }

  if (!data) {
    throw new Error('Paid chat completion response was empty.');
  }

  return data;
}
