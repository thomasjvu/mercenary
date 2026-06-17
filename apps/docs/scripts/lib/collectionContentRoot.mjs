import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function resolveMonorepoRoot(startDir = process.cwd()) {
  let current = startDir;

  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return startDir;
}

export function resolveCollectionContentRoot(collection, startDir = process.cwd()) {
  const monorepoRoot = resolveMonorepoRoot(startDir);
  return join(monorepoRoot, collection.contentDir);
}