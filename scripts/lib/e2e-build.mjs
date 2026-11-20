import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCommand } from './process-harness.mjs';

export async function prepareE2eBuild({
  rootDir,
  env,
  args,
  requiredFiles,
  skipBuild = process.argv.includes('--skip-build'),
}) {
  const startedAt = performance.now();
  if (!skipBuild) {
    console.log(JSON.stringify({ step: 'build' }));
    await runCommand(rootDir, env, 'pnpm', args);
  }
  for (const file of requiredFiles) {
    const output = await stat(resolve(rootDir, file)).catch(() => undefined);
    if (!output?.isFile()) {
      throw new Error(`Missing E2E build output: ${file}. Run pnpm build before --skip-build.`);
    }
  }
  const result = {
    mode: skipBuild ? 'reused' : 'built',
    reason: skipBuild ? 'explicit --skip-build; use outputs from this job' : 'default local build',
    durationMs: Math.round(performance.now() - startedAt),
  };
  console.log(JSON.stringify({ step: 'build_ready', ...result }));
  return result;
}
