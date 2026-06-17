import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the papers package root from a script import.meta.url.
 * scripts/*.mjs -> package root is the parent of scripts/.
 */
export function resolvePackageDir(importMetaUrl) {
  const scriptDir = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(scriptDir, '..');
}

/**
 * Resolve the runtime app root.
 * Standalone papers uses the package dir; embedded apps may override via PAPERS_APP_ROOT.
 */
export function resolveAppDir(packageDir) {
  const override = process.env.PAPERS_APP_ROOT?.trim();
  if (override) {
    return path.resolve(override);
  }

  return packageDir;
}

/**
 * Source directories scanned for icon usage during generate:icons.
 */
export function resolveScanDirs(packageDir, appDir) {
  const dirs = [path.join(packageDir, 'src'), path.join(packageDir, 'shared')];

  if (appDir !== packageDir) {
    dirs.push(path.join(appDir, 'src'));
  }

  return dirs.filter((dir) => existsSync(dir));
}