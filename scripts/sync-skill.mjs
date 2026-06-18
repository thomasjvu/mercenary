#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = join(repoRoot, 'content/skill.md');
const targets = [
  join(repoRoot, 'apps/docs/public/skill.md'),
  join(repoRoot, 'apps/web/public/skill.md'),
];

if (!existsSync(sourcePath)) {
  console.error(`Missing canonical skill file at ${sourcePath}`);
  process.exit(1);
}

for (const targetPath of targets) {
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  console.log(`Synced skill.md -> ${targetPath}`);
}
