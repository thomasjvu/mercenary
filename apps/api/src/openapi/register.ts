import fastifySwagger from '@fastify/swagger';
import type { FastifyInstance } from 'fastify';

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Boss Raid API',
        version: '0.1.0',
        description:
          'Open marketplace API for discount inference, Mercenary raids, seller onboarding, and operator runtime.',
      },
      servers: [
        {
          url: 'http://localhost:8787',
          description: 'Local development',
        },
      ],
      tags: [
        { name: 'Health', description: 'Liveness and readiness probes.' },
        { name: 'Auth', description: 'Wallet session and buyer API keys.' },
        { name: 'Raid', description: 'Mercenary multi-agent raids.' },
        { name: 'Chat', description: 'OpenAI-compatible chat completions.' },
        { name: 'Marketplace', description: 'Models, prices, and marketplace stats.' },
        { name: 'Account', description: 'Buyer balance and purchase history.' },
        { name: 'Providers', description: 'Seller registration and callbacks.' },
        { name: 'Bounties', description: 'Bounty escrow and payouts.' },
        { name: 'Ops', description: 'Operator session, runtime, and readiness gates.' },
      ],
    },
  });
}
