#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDir = join(repoRoot, 'apps/docs/public/images/docs/role-heroes');

const sources = [
  ['buyer', join(repoRoot, 'apps/web/src/assets/hero-manga-buyer.jpg')],
  ['seller', join(repoRoot, 'apps/web/src/assets/hero-manga.jpg')],
  ['raider', join(repoRoot, 'apps/web/src/assets/hero-manga-raiders.jpg')],
];

mkdirSync(outputDir, { recursive: true });

for (const [name, sourcePath] of sources) {
  if (!existsSync(sourcePath)) {
    console.error(`Missing role hero source: ${sourcePath}`);
    process.exit(1);
  }

  const targetPath = join(outputDir, `${name}.jpg`);
  copyFileSync(sourcePath, targetPath);
  console.log(`Synced role hero -> ${targetPath}`);
}