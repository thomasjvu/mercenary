export type PlaygroundMode = 'inference' | 'raid';

export function readPlaygroundMode(search = window.location.search): PlaygroundMode {
  const mode = new URLSearchParams(search).get('mode')?.trim().toLowerCase();
  return mode === 'raid' ? 'raid' : 'inference';
}

export function buildPlaygroundUrl(options?: { mode?: PlaygroundMode; modelId?: string }): string {
  const params = new URLSearchParams();
  if (options?.mode === 'raid') {
    params.set('mode', 'raid');
  }
  if (options?.modelId?.trim()) {
    params.set('model', options.modelId.trim());
  }
  const query = params.toString();
  return query ? `/playground?${query}` : '/playground';
}
