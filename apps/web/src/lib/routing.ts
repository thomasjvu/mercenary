export function readMarketplaceModelId(pathname = window.location.pathname): string | undefined {
  const match = pathname.match(/^\/marketplace\/([^/]+)\/?$/);
  if (!match?.[1]) {
    return undefined;
  }

  try {
    return decodeURIComponent(match[1]).trim() || undefined;
  } catch {
    return match[1].trim() || undefined;
  }
}

export function isMarketplaceListPath(pathname = window.location.pathname): boolean {
  return pathname === '/marketplace' || pathname === '/marketplace/';
}

export function isMarketplaceDetailPath(pathname = window.location.pathname): boolean {
  return readMarketplaceModelId(pathname) != null;
}

export function marketplaceModelPath(modelId: string): string {
  return `/marketplace/${encodeURIComponent(modelId)}`;
}

export function readPlaygroundModelId(search = window.location.search): string | undefined {
  const model = new URLSearchParams(search).get('model')?.trim();
  return model && model.length > 0 ? model : undefined;
}
