import { addCollection } from '@iconify/react';

let loaded = false;
let loading: Promise<void> | undefined;

export function ensureIconCollections(): Promise<void> {
  if (loaded) {
    return Promise.resolve();
  }
  loading ??= Promise.all([
    import('@iconify-json/pixel'),
    import('@iconify-json/simple-icons'),
  ]).then(([pixel, simple]) => {
    addCollection(pixel.icons);
    addCollection(simple.icons);
    loaded = true;
  });
  return loading;
}
