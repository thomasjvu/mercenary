type OpenApiDocument = {
  openapi: string;
  info: Record<string, unknown>;
  paths: Record<string, Record<string, Record<string, unknown>>>;
  [key: string]: unknown;
};

function isInternalOperation(operation: Record<string, unknown>): boolean {
  if (operation['x-bossraid-audience'] === 'internal') {
    return true;
  }

  const tags = operation.tags;
  return Array.isArray(tags) && tags.includes('Ops');
}

export function filterOpenApiDocument(
  document: OpenApiDocument,
  audience: 'public' | 'internal'
): OpenApiDocument {
  const nextPaths: OpenApiDocument['paths'] = {};

  for (const [path, methods] of Object.entries(document.paths ?? {})) {
    const nextMethods: Record<string, Record<string, unknown>> = {};

    for (const [method, operation] of Object.entries(methods)) {
      const internal = isInternalOperation(operation);
      const include = audience === 'internal' ? internal : !internal;
      if (include) {
        nextMethods[method] = operation;
      }
    }

    if (Object.keys(nextMethods).length > 0) {
      nextPaths[path] = nextMethods;
    }
  }

  return {
    ...document,
    info: {
      ...document.info,
      title:
        audience === 'internal'
          ? 'Boss Raid Operator API'
          : ((document.info.title as string | undefined) ?? 'Boss Raid Public API'),
      description:
        audience === 'internal'
          ? 'Operator session, runtime telemetry, and production readiness routes.'
          : ((document.info.description as string | undefined) ??
            'Buyer, seller, and raider routes for Boss Raid.'),
    },
    paths: nextPaths,
  };
}
