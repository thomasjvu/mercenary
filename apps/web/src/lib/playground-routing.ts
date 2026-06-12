export type PlaygroundMode = 'inference' | 'raid';

export function readPlaygroundMode(search = window.location.search): PlaygroundMode {
  const mode = new URLSearchParams(search).get('mode')?.trim().toLowerCase();
  return mode === 'raid' ? 'raid' : 'inference';
}

export function buildPlaygroundUrl(options?: {
  mode?: PlaygroundMode;
  modelId?: string;
  search?: string;
}): string {
  const current = new URLSearchParams(options?.search ?? '');
  const modelId = options?.modelId?.trim() || current.get('model')?.trim() || '';
  const params = new URLSearchParams();

  if (options?.mode === 'raid') {
    params.set('mode', 'raid');
  }

  if (modelId) {
    params.set('model', modelId);
  }

  const query = params.toString();
  return query ? `/playground?${query}` : '/playground';
}
