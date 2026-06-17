#!/usr/bin/env node
/**
 * Pull framework updates from thomasjvu/papers into apps/docs without touching Boss Raid content.
 *
 * Usage:
 *   node scripts/papers-sync-upstream.mjs
 *   node scripts/papers-sync-upstream.mjs --dry-run
 *
 * Never syncs:
 *   content/
 *   apps/docs/shared/documentation-config.js
 *   apps/docs/shared/content-collections.js
 *   apps/docs/shared/docsRouting.js (Boss Raid collection routing)
 *   apps/docs/.env.local
 *   Boss Raid override files listed in PROTECTED_RELATIVE_PATHS
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  cacheDir,
  docsAppDir,
  PAPERS_REPO,
  repoRoot,
  shouldSkipFrameworkPath,
  SYNC_PATHS,
} from './papers-sync-lib.mjs';

const dryRun = process.argv.includes('--dry-run');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: options.cwd ?? repoRoot,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureUpstreamCheckout() {
  mkdirSync(dirname(cacheDir), { recursive: true });

  if (!existsSync(join(cacheDir, '.git'))) {
    rmSync(cacheDir, { recursive: true, force: true });
    run('git', ['clone', '--depth', '1', PAPERS_REPO, cacheDir]);
    return;
  }

  run('git', ['fetch', 'origin', 'main'], { cwd: cacheDir });
  run('git', ['checkout', 'main'], { cwd: cacheDir });
  run('git', ['reset', '--hard', 'origin/main'], { cwd: cacheDir });
}

function syncFile(sourcePath, targetPath, relativePath) {
  if (shouldSkipFrameworkPath(relativePath)) {
    console.log(`skip protected: ${relativePath}`);
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}sync ${relativePath}`);
  if (dryRun) {
    return;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath);
}

function syncDirectory(sourceDir, targetDir, baseRelativePath = '') {
  if (!existsSync(sourceDir)) {
    console.warn(`skip missing upstream path: ${baseRelativePath || sourceDir}`);
    return;
  }

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const relativePath = baseRelativePath ? join(baseRelativePath, entry) : entry;
    const targetPath = join(targetDir, entry);
    const stats = statSync(sourcePath);

    if (stats.isDirectory()) {
      if (shouldSkipFrameworkPath(relativePath)) {
        console.log(`skip protected: ${relativePath}/`);
        continue;
      }

      syncDirectory(sourcePath, targetPath, relativePath);
      continue;
    }

    syncFile(sourcePath, targetPath, relativePath);
  }
}

function syncPath(relativePath) {
  const source = join(cacheDir, relativePath);
  const target = join(docsAppDir, relativePath);

  if (!existsSync(source)) {
    console.warn(`skip missing upstream path: ${relativePath}`);
    return;
  }

  const stats = statSync(source);
  if (stats.isDirectory()) {
    if (dryRun) {
      console.log(`[dry-run] sync ${relativePath}/`);
      syncDirectory(source, target, relativePath);
      return;
    }

    syncDirectory(source, target, relativePath);
    return;
  }

  syncFile(source, target, relativePath);
}

function main() {
  console.log('papers-sync-upstream: fetching thomasjvu/papers');
  ensureUpstreamCheckout();

  for (const relativePath of SYNC_PATHS) {
    syncPath(relativePath);
  }

  console.log(
    dryRun
      ? 'Dry run complete. Re-run without --dry-run to apply framework updates.'
      : 'Framework sync complete. Protected Boss Raid overrides were preserved.'
  );
  console.log(
    'Protected: content/, documentation-config.js, content-collections.js, docsRouting.js, and Boss Raid override files.'
  );
  console.log('Push dogfood fixes upstream: pnpm papers:sync-downstream -- --apply');
}

main();