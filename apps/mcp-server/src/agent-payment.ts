import { createNodePaidFetch, type PaidFetchOptions } from '@bossraid/smart-pay';

export type StoredAgentPaymentSession = {
  sessionAccount: `0x${string}`;
  permissionFrom: `0x${string}`;
  permissionContext: string;
  weeklyBudgetUsd?: number;
  expiresAt?: string;
};

let storedSession: StoredAgentPaymentSession | null = null;

export function setAgentPaymentSession(session: StoredAgentPaymentSession): void {
  storedSession = session;
}

export function getAgentPaymentSession(): StoredAgentPaymentSession | null {
  return storedSession;
}

export function clearAgentPaymentSession(): void {
  storedSession = null;
}

export function createAgentPaidFetch(): typeof fetch | undefined {
  const privateKey = process.env.BOSSRAID_AGENT_WALLET_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    return undefined;
  }

  const options: PaidFetchOptions = {
    sessionAccount: storedSession?.sessionAccount,
    permissionContext: storedSession?.permissionContext,
    permissionFrom: storedSession?.permissionFrom,
    delegationChain: storedSession
      ? [
          {
            type: 'erc7715_grant',
            at: new Date().toISOString(),
            from: storedSession.permissionFrom,
            to: storedSession.sessionAccount,
            summary: 'Stored ERC-7715 raid budget for MCP redelegation.',
          },
          {
            type: 'erc7710_redelegation',
            at: new Date().toISOString(),
            from: storedSession.permissionFrom,
            to: storedSession.sessionAccount,
            summary: 'MCP agent redelegates budget for x402 raid payment.',
          },
        ]
      : undefined,
  };

  return createNodePaidFetch(privateKey, options);
}
