#!/usr/bin/env node
import http from 'node:http';

const host = process.env.BOSSRAID_MOCK_FACILITATOR_HOST ?? '127.0.0.1';
const port = Number(process.env.BOSSRAID_MOCK_FACILITATOR_PORT ?? '8791');

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  const path = new URL(req.url ?? '/', `http://${host}:${port}`).pathname;
  if (path === '/verify') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ isValid: true, payer: '0x000000000000000000000000000000000000dEaD' }));
    return;
  }

  if (path === '/settle') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        transaction: '0xmocksettlement',
        network: 'eip155:84532',
        payer: '0x000000000000000000000000000000000000dEaD',
      })
    );
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ ok: true, host, port, paths: ['/verify', '/settle'] }));
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);