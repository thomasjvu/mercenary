#!/usr/bin/env node
import http from 'node:http';

const host = process.env.BOSSRAID_MOCK_FACILITATOR_HOST ?? '127.0.0.1';
const port = Number(process.env.BOSSRAID_MOCK_FACILITATOR_PORT ?? '8791');
const fallbackPayer =
  process.env.BOSSRAID_MOCK_FACILITATOR_PAYER ?? '0x000000000000000000000000000000000000dEaD';

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  const path = new URL(req.url ?? '/', `http://${host}:${port}`).pathname;
  const body = await readJsonBody(req);
  const payer = resolvePayer(body);

  if (path === '/verify') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ isValid: true, payer }));
    return;
  }

  if (path === '/settle') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        transaction: '0xmocksettlement',
        network: 'eip155:4663',
        payer,
      })
    );
    return;
  }

  if (path === '/refund') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        transaction: '0xmockrefund',
        network: 'eip155:4663',
        payer,
      })
    );
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ ok: true, host, port, paths: ['/verify', '/settle', '/refund'] }));
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolvePayer(body) {
  const payload = body?.paymentPayload;
  if (payload && typeof payload === 'object') {
    if (typeof payload.payer === 'string' && payload.payer.trim()) {
      return payload.payer;
    }
    if (typeof payload.from === 'string' && payload.from.trim()) {
      return payload.from;
    }
  }
  return fallbackPayer;
}