import { fetchJson, requestJsonDetailedWeb as requestJsonDetailed } from './client.js';

export type AgentSessionGrant = {
  wallet: string;
  sessionAccount: string;
  permissionFrom: string;
  permissionContext: string;
  grantedAt: string;
  expiresAt: string;
  weeklyBudgetUsd?: number;
};

export async function saveAgentSession(input: {
  sessionAccount: string;
  permissionFrom: string;
  permissionContext: string;
  expiresAt: string;
  weeklyBudgetUsd?: number;
}): Promise<{ grant: AgentSessionGrant }> {
  return fetchJson<{ grant: AgentSessionGrant }>('/v1/auth/agent-session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function fetchAgentSession(): Promise<{ grant: AgentSessionGrant } | null> {
  const response = await requestJsonDetailed<{ grant: AgentSessionGrant }>(
    '/v1/auth/agent-session'
  );
  if (response.status === 404 || response.status === 401) {
    return null;
  }
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? 'Failed to load agent payment session.');
  }
  return response.data;
}

export async function deleteAgentSession(): Promise<void> {
  await fetchJson('/v1/auth/agent-session', {
    method: 'DELETE',
  });
}

export async function fetchRelayerStatus(taskId: string): Promise<{
  taskId: string;
  status: string;
  transactionHash?: string;
}> {
  return fetchJson(`/v1/relayer/status/${encodeURIComponent(taskId)}`);
}
