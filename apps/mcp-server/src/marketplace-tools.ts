import { createHash } from 'node:crypto';
import { apiRequest, type ApiAuth } from './api-client.js';

const operations = {
  earnings: { method: 'GET', path: '/v1/seller/earnings', auth: 'wallet' },
  purchases: { method: 'GET', path: '/v1/buyer/purchases', auth: 'wallet' },
  balance: { method: 'GET', path: '/v1/buyer/balance', auth: 'wallet' },
  bounties: { method: 'GET', path: '/v1/bounties', auth: 'none' },
  bounty: { method: 'GET', path: '/v1/bounties/:bountyId', auth: 'none' },
  post: { method: 'POST', path: '/v1/bounties', auth: 'wallet' },
  fund: { method: 'POST', path: '/v1/bounties/:bountyId/fund', auth: 'wallet' },
  bid: { method: 'POST', path: '/v1/bounties/:bountyId/bids', auth: 'provider' },
  award: { method: 'POST', path: '/v1/bounties/:bountyId/award', auth: 'wallet' },
  deliver: {
    method: 'POST',
    path: '/v1/bounties/:bountyId/awards/:awardId/deliver',
    auth: 'provider',
  },
  accept: { method: 'POST', path: '/v1/bounties/:bountyId/awards/:awardId/accept', auth: 'wallet' },
  claim: { method: 'POST', path: '/v1/bounties/:bountyId/awards/:awardId/claim', auth: 'none' },
  refund: { method: 'POST', path: '/v1/bounties/:bountyId/refund', auth: 'wallet' },
  sellers: { method: 'GET', path: '/v1/seller/providers', auth: 'wallet' },
  register: { method: 'POST', path: '/v1/seller/providers', auth: 'wallet' },
  update: { method: 'PATCH', path: '/v1/seller/providers/:providerId', auth: 'wallet' },
  verify: { method: 'POST', path: '/v1/seller/providers/:providerId/verify', auth: 'wallet' },
} as const;

export const marketplaceTool = {
  name: 'bossraid_market',
  description:
    'Browse or trade paid bounties and manage seller workers. Posting, funding, awarding, accepting, refunding and registration require a connected wallet session. Bids and deliveries use provider bearer credentials. Deliveries compute SHA-256 automatically from artifactsJson. Never put credentials in arguments.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(operations) },
      bountyId: { type: 'string' },
      awardId: { type: 'string' },
      providerId: { type: 'string' },
      status: { type: 'string', description: 'Optional bounty-board status filter.' },
      body: {
        type: 'object',
        description:
          'Operation payload from the Boss Raid API schema; do not include credentials. Seller registration auth is injected from BOSSRAID_PROVIDER_TOKEN.',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

export async function executeMarketplaceTool(args: Record<string, unknown>) {
  const action = String(args.action);
  const operation = operations[action as keyof typeof operations];
  if (!operation) throw new Error('Unknown marketplace action');
  let path: string = operation.path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
    const id = args[key];
    if (typeof id !== 'string' || !id.trim()) throw new Error(`${key} is required`);
    return encodeURIComponent(id);
  });
  if (action === 'bounties' && typeof args.status === 'string')
    path += `?status=${encodeURIComponent(args.status)}`;
  const body =
    args.body && typeof args.body === 'object' && !Array.isArray(args.body)
      ? { ...(args.body as Record<string, unknown>) }
      : {};
  if ('auth' in body || 'token' in body || 'apiKey' in body)
    throw new Error('Store credentials in the MCP environment, not tool arguments.');
  if (action === 'deliver') {
    if (typeof body.artifactsJson !== 'string')
      throw new Error('artifactsJson must be a JSON string');
    JSON.parse(body.artifactsJson);
    body.deliveryHash = createHash('sha256').update(body.artifactsJson).digest('hex');
  }
  if (action === 'bid') {
    body.providerId ??= args.providerId;
  }
  if (action === 'register') {
    const token = process.env.BOSSRAID_PROVIDER_TOKEN;
    if (!token) throw new Error('Configure BOSSRAID_PROVIDER_TOKEN before registering a worker.');
    body.auth = { type: 'bearer', token };
  }
  return apiRequest(
    path,
    {
      method: operation.method,
      ...(operation.method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    },
    operation.auth as ApiAuth
  );
}
