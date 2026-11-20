import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareE2eBuild } from './e2e-build.mjs';

// Failure modes: local runs skip builds implicitly; CI reuses absent outputs;
// a directory masquerades as an executable; build failures become green smoke runs.
// Exercise the real command runner with a disposable executable and filesystem.
test('E2E builds execute by default and reuse only explicitly requested outputs', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'bossraid-e2e-build-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const bin = join(rootDir, 'bin');
  await mkdir(bin);
  const commandLog = join(rootDir, 'commands');
  await writeFile(
    join(bin, 'pnpm'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nexit "${BUILD_EXIT:-0}"\n'
  );
  await chmod(join(bin, 'pnpm'), 0o755);
  const options = {
    rootDir,
    env: { ...process.env, PATH: bin, COMMAND_LOG: commandLog },
    args: ['build'],
    requiredFiles: ['dist/index.js'],
  };
  await mkdir(join(rootDir, 'dist'));
  await writeFile(join(rootDir, 'dist/index.js'), 'export {};');
  assert.equal((await prepareE2eBuild({ ...options, skipBuild: false })).mode, 'built');
  assert.equal(await readFile(commandLog, 'utf8'), 'build\n');
  assert.equal((await prepareE2eBuild({ ...options, skipBuild: true })).mode, 'reused');
  assert.equal(await readFile(commandLog, 'utf8'), 'build\n');
  await rm(join(rootDir, 'dist/index.js'));
  await assert.rejects(
    prepareE2eBuild({ ...options, skipBuild: true }),
    /Missing E2E build output/
  );
  await mkdir(join(rootDir, 'dist/index.js'));
  await assert.rejects(
    prepareE2eBuild({ ...options, skipBuild: true }),
    /Missing E2E build output/
  );
  await assert.rejects(
    prepareE2eBuild({ ...options, skipBuild: false, env: { ...options.env, BUILD_EXIT: '7' } }),
    /exited with code 7/
  );
});
