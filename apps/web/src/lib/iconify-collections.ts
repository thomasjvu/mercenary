import { addCollection } from '@iconify/react';
import { pixelIconSubset, simpleIconSubset } from './icon-subset-data.js';

let loaded = false;

export function ensureIconCollections(): Promise<void> {
  if (loaded) {
    return Promise.resolve();
  }
  addCollection(pixelIconSubset);
  addCollection(simpleIconSubset);
  loaded = true;
  return Promise.resolve();
}
