import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specFiles = [
  resolve(repoRoot, 'apps/docs/public/openapi-v1.yaml'),
  resolve(repoRoot, 'apps/docs/public/openapi-internal.yaml'),
];

function hashFile(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

const checkOnly = process.argv.includes('--check');
const before = new Map(
  await Promise.all(
    specFiles.map(async (path) => [path, await readFile(path, 'utf8').catch(() => '')])
  )
);

const exportResult = spawnSync(
  process.execPath,
  ['--import', 'tsx', resolve(repoRoot, 'scripts/export-openapi.mjs')],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: 'tsconfig.base.json',
    },
    stdio: 'inherit',
  }
);

if (exportResult.status !== 0) {
  process.exit(exportResult.status ?? 1);
}

if (!checkOnly) {
  process.exit(0);
}

const drifted = [];

for (const path of specFiles) {
  const previous = before.get(path) ?? '';
  const next = await readFile(path, 'utf8');
  if (hashFile(previous) !== hashFile(next)) {
    drifted.push(path);
    await writeFile(path, previous, 'utf8');
  }
}

if (drifted.length > 0) {
  console.error('OpenAPI specs are out of date. Run `pnpm bossraid sync:openapi`.');
  for (const path of drifted) {
    console.error(` - ${path}`);
  }
  process.exit(1);
}

console.log('OpenAPI specs are up to date.');