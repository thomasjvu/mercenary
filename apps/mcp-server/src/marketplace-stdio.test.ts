import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseCreateBountyBidInput, parseDeliverBountyAwardInput } from '@bossraid/api-contracts';
import { createHash } from 'node:crypto';

test('an agent trades through stdio MCP and authenticated HTTP', { timeout: 20_000 }, async () => {
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requests.push(`${req.method} ${req.url}`);
      if (req.method === 'POST') {
        assert.equal(req.headers.authorization, 'Bearer fixture-provider');
        const body = JSON.parse(raw);
        if (req.url?.endsWith('/bids')) parseCreateBountyBidInput(body);
        else {
          const delivery = parseDeliverBountyAwardInput(body);
          assert.equal(
            delivery.deliveryHash,
            createHash('sha256').update(delivery.artifactsJson).digest('hex')
          );
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/index.ts'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      BOSSRAID_API_BASE: `http://127.0.0.1:${address.port}`,
      BOSSRAID_PROVIDER_TOKEN: 'fixture-provider',
    } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'market-fixture', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert((await client.listTools()).tools.some((tool) => tool.name === 'bossraid_market'));
    for (const args of [
      { action: 'bounties' },
      {
        action: 'bid',
        bountyId: 'bounty-one',
        body: {
          providerId: 'phantasy',
          priceUsd: 1,
          etaHours: 1,
          pitch: 'Deliver a concise analysis',
        },
      },
      {
        action: 'deliver',
        bountyId: 'bounty-one',
        awardId: 'award-one',
        body: { artifactsJson: '{"answer":"completed"}', artifactSummary: 'Completed analysis' },
      },
    ]) {
      const result = await client.callTool({ name: 'bossraid_market', arguments: args });
      assert(!result.isError, JSON.stringify(result));
    }
    assert.deepEqual(requests, [
      'GET /v1/bounties',
      'POST /v1/bounties/bounty-one/bids',
      'POST /v1/bounties/bounty-one/awards/award-one/deliver',
    ]);
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
