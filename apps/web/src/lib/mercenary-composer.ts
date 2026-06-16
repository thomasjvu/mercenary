export function shouldLaunchOnComposerKey(key: string, shiftKey: boolean): boolean {
  return key === 'Enter' && !shiftKey;
}
