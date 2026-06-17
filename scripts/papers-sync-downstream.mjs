#!/usr/bin/env node
/**
 * Push portable framework improvements from apps/docs to thomasjvu/papers.
 *
 * Usage:
 *   node scripts/papers-sync-downstream.mjs              # list diffs vs upstream
 *   node scripts/papers-sync-downstream.mjs --dry-run      # show what --apply would copy
 *   node scripts/papers-sync-downstream.mjs --apply        # copy non-protected diffs to cache checkout
 *   node scripts/papers-sync-downstream.mjs --portable     # list Boss Raid overrides to port manually
 *   node scripts/papers-sync-downstream.mjs --branch feat/foo --apply
 *
 * Never touches:
 *   content/
 *   Boss Raid protected overrides (unless you copy portable paths by hand)
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import {
  cacheDir,
  docsAppDir,
  PORTABLE_IMPROVEMENTS,
  PAPERS_REPO,
  repoRoot,
  shouldSkipFrameworkPath,
  SYNC_PATHS,
} from './papers-sync-lib.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const showPortable = args.includes('--portable');
const branchIndex = args.indexOf('--branch');
const branchName = branchIndex >= 0 ? args[branchIndex + 1] : null;

function run(command, runArgs, options = {}) {
  const result = spawnSync(command, runArgs, {
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

function hashFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function collectFrameworkFiles(baseDir, baseRelativePath = '') {
  const files = [];

  if (!existsSync(baseDir)) {
    return files;
  }

  for (const entry of readdirSync(baseDir)) {
    const sourcePath = join(baseDir, entry);
    const relativePath = baseRelativePath ? join(baseRelativePath, entry) : entry;
    const stats = statSync(sourcePath);

    if (stats.isDirectory()) {
      if (shouldSkipFrameworkPath(relativePath)) {
        continue;
      }

      files.push(...collectFrameworkFiles(sourcePath, relativePath));
      continue;
    }

    if (shouldSkipFrameworkPath(relativePath)) {
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

function collectSyncScopeFiles() {
  const files = new Set();

  for (const syncPath of SYNC_PATHS) {
    const localPath = join(docsAppDir, syncPath);
    if (!existsSync(localPath)) {
      continue;
    }

    const stats = statSync(localPath);
    if (stats.isFile()) {
      if (!shouldSkipFrameworkPath(syncPath)) {
        files.add(syncPath);
      }
      continue;
    }

    for (const relativePath of collectFrameworkFiles(localPath, syncPath)) {
      files.add(relativePath);
    }
  }

  return Array.from(files).sort();
}

function findChangedFiles() {
  const changed = [];

  for (const relativePath of collectSyncScopeFiles()) {
    const localPath = join(docsAppDir, relativePath);
    const upstreamPath = join(cacheDir, relativePath);
    const localHash = hashFile(localPath);
    const upstreamHash = hashFile(upstreamPath);

    if (localHash !== upstreamHash) {
      changed.push({
        relativePath,
        localPath,
        upstreamPath,
        status: upstreamHash === null ? 'added' : localHash === null ? 'removed' : 'modified',
      });
    }
  }

  return changed;
}

function printPortableImprovements() {
  console.log('Portable Boss Raid improvements (manual upstream port):');
  for (const entry of PORTABLE_IMPROVEMENTS) {
    console.log(`  - ${entry.path}`);
    console.log(`    ${entry.note}`);
  }
  console.log('');
  console.log('These live in PROTECTED_RELATIVE_PATHS so upstream pulls never overwrite Boss Raid wiring.');
  console.log('Generalize them in a papers PR, then drop paths from the protected set when merged.');
}

function applyChanges(changed) {
  if (changed.length === 0) {
    console.log('No portable framework diffs to apply.');
    return;
  }

  if (branchName) {
    console.log(`Creating branch ${branchName} in papers checkout`);
    if (!dryRun) {
      run('git', ['checkout', '-b', branchName], { cwd: cacheDir });
    }
  }

  for (const entry of changed) {
    console.log(`${dryRun ? '[dry-run] ' : ''}push ${entry.relativePath} (${entry.status})`);

    if (dryRun) {
      continue;
    }

    if (entry.status === 'removed') {
      if (existsSync(entry.upstreamPath)) {
        rmSync(entry.upstreamPath, { force: true });
      }
      continue;
    }

    mkdirSync(dirname(entry.upstreamPath), { recursive: true });
    cpSync(entry.localPath, entry.upstreamPath);
  }

  if (!dryRun && apply) {
    const summaryPath = join(cacheDir, '.boss-raid-downstream-summary.txt');
    const lines = [
      'Boss Raid downstream sync',
      `Repo: ${PAPERS_REPO}`,
      `Changed files: ${changed.length}`,
      '',
      ...changed.map((entry) => `${entry.status}\t${entry.relativePath}`),
      '',
      'Next:',
      '  cd .cache/papers-upstream',
      '  git status',
      '  git add -A',
      '  git commit -m "feat: framework improvements from boss-raid dogfood"',
      '  git push origin <branch>',
      '  gh pr create --repo thomasjvu/papers',
    ];
    writeFileSync(summaryPath, `${lines.join('\n')}\n`);
    console.log(`Wrote ${relative(repoRoot, summaryPath)}`);
  }
}

function main() {
  console.log('papers-sync-downstream: comparing apps/docs with thomasjvu/papers');
  ensureUpstreamCheckout();

  if (showPortable) {
    printPortableImprovements();
    return;
  }

  const changed = findChangedFiles();

  if (changed.length === 0) {
    console.log('No non-protected framework diffs vs upstream.');
    console.log('Run with --portable to see Boss Raid overrides worth generalizing upstream.');
    return;
  }

  console.log(`Found ${changed.length} changed framework file(s):`);
  for (const entry of changed) {
    console.log(`  ${entry.status.padEnd(8)} ${entry.relativePath}`);
  }

  if (!apply && !dryRun) {
    console.log('');
    console.log('Re-run with --dry-run --apply to preview, or --apply to copy into .cache/papers-upstream.');
    printPortableImprovements();
    return;
  }

  applyChanges(changed);

  if (apply && !dryRun) {
    console.log('Downstream copy complete. Review .cache/papers-upstream and open a PR to thomasjvu/papers.');
  } else if (dryRun) {
    console.log('Dry run complete.');
  }
}

main();