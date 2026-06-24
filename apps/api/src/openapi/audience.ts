import type { FastifySchema } from 'fastify';

declare module 'fastify' {
  interface FastifySchema {
    'x-bossraid-audience'?: 'public' | 'internal';
  }
}

export type BossRaidOpenApiAudience = 'public' | 'internal';

export function publicRouteSchema(schema: FastifySchema): FastifySchema {
  return {
    ...schema,
    'x-bossraid-audience': 'public',
  };
}

export function internalRouteSchema(schema: FastifySchema): FastifySchema {
  const tags = schema.tags ?? [];
  return {
    ...schema,
    tags: tags.includes('Ops') ? tags : [...tags, 'Ops'],
    'x-bossraid-audience': 'internal',
  };
}
