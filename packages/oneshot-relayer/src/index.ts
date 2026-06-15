export const DEFAULT_ONESHOT_RELAYER_URL = 'https://relayer.1shotapi.com/relayers';

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
};

export type RelayerCapabilities = {
  chainId: string;
  feeCollector?: string;
  targetAddress?: string;
  tokens?: Array<{
    address: string;
    symbol?: string;
    decimals?: number;
    minFee?: string;
  }>;
};

export type RelayerFeeData = {
  gasPrice?: string;
  rate?: string;
  minFee?: string;
  expiry?: number;
  context?: string;
};

export type RelayerTaskStatus = {
  taskId: string;
  status: 'Pending' | 'Submitted' | 'Confirmed' | 'Rejected' | 'Reverted' | string;
  transactionHash?: string;
  error?: string;
};

async function relayerRequest<T>(relayerUrl: string, method: string, params?: unknown): Promise<T> {
  const response = await fetch(relayerUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    } satisfies JsonRpcRequest),
  });

  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `1Shot relayer request failed (${response.status}).`);
  }

  if (payload.result === undefined) {
    throw new Error(`1Shot relayer returned no result for ${method}.`);
  }

  return payload.result;
}

export async function getRelayerCapabilities(
  relayerUrl: string,
  chainId: string | number
): Promise<RelayerCapabilities> {
  return relayerRequest<RelayerCapabilities>(relayerUrl, 'relayer_getCapabilities', [
    String(chainId),
  ]);
}

export async function getRelayerFeeData(
  relayerUrl: string,
  input: { chainId: string | number; token: string }
): Promise<RelayerFeeData> {
  return relayerRequest<RelayerFeeData>(relayerUrl, 'relayer_getFeeData', {
    chainId: String(input.chainId),
    token: input.token,
  });
}

export async function estimate7710Transaction(
  relayerUrl: string,
  bundle: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return relayerRequest<Record<string, unknown>>(
    relayerUrl,
    'relayer_estimate7710Transaction',
    bundle
  );
}

export async function send7710Transaction(
  relayerUrl: string,
  bundle: Record<string, unknown>
): Promise<{ TaskId?: string; taskId?: string }> {
  return relayerRequest<{ TaskId?: string; taskId?: string }>(
    relayerUrl,
    'relayer_send7710Transaction',
    bundle
  );
}

export async function getRelayerStatus(
  relayerUrl: string,
  taskId: string
): Promise<RelayerTaskStatus> {
  const result = await relayerRequest<Record<string, unknown>>(relayerUrl, 'relayer_getStatus', {
    taskId,
  });

  return {
    taskId,
    status: String(result.status ?? 'Pending'),
    transactionHash:
      typeof result.transactionHash === 'string'
        ? result.transactionHash
        : typeof result.txHash === 'string'
          ? result.txHash
          : undefined,
    error: typeof result.error === 'string' ? result.error : undefined,
  };
}

export function readRelayerTaskId(result: {
  TaskId?: string;
  taskId?: string;
}): string | undefined {
  return result.TaskId ?? result.taskId;
}
