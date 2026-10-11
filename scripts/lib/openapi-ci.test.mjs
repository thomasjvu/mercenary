import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
for (const host of ['.forgejo', '.github']) {
  test(`${host} checks committed OpenAPI before any build`, async () => {
    const workflow = parse(await readFile(resolve(repoRoot, host, 'workflows/ci.yml'), 'utf8'));
    const steps = workflow.jobs.verify.steps;
    const drift = steps.findIndex((step) => step.run?.includes('check:openapi'));
    assert.ok(drift >= 0, 'OpenAPI drift gate exists');
    const builds = steps.flatMap((step, index) =>
      /\bpnpm\s+(?:run\s+)?build(?:\b|:)/.test(step.run ?? '') ? [index] : []
    );
    assert.ok(builds.length > 0);
    assert.ok(
      builds.every((index) => drift < index),
      'drift gate must precede build generators'
    );
  });
}

test('OpenAPI checker rejects stale specs and restores committed inputs', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'bossraid-openapi-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await writeFile(join(fixture, 'tsconfig.base.json'), '{}');
  await mkdir(join(fixture, 'scripts'), { recursive: true });
  await mkdir(join(fixture, 'apps/docs/public'), { recursive: true });
  await symlink(resolve(repoRoot, 'node_modules'), join(fixture, 'node_modules'), 'dir');
  await writeFile(
    join(fixture, 'scripts/check-openapi.mjs'),
    await readFile(resolve(repoRoot, 'scripts/check-openapi.mjs'))
  );
  // Substitute only the exporter: the real checker must reject and restore its output.
  await writeFile(
    join(fixture, 'scripts/export-openapi.mjs'),
    `import { writeFile } from 'node:fs/promises';
    for (const name of ['openapi-v1.yaml', 'openapi-internal.yaml']) await writeFile('apps/docs/public/' + name, 'current schema\\n');`
  );
  const specs = ['openapi-v1.yaml', 'openapi-internal.yaml'];
  for (const name of specs)
    await writeFile(join(fixture, 'apps/docs/public', name), 'stale schema\n');
  let result = spawnSync(process.execPath, ['scripts/check-openapi.mjs', '--check'], {
    cwd: fixture,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /OpenAPI specs are out of date/);
  for (const name of specs) {
    assert.equal(await readFile(join(fixture, 'apps/docs/public', name), 'utf8'), 'stale schema\n');
    await writeFile(join(fixture, 'apps/docs/public', name), 'current schema\n');
  }
  result = spawnSync(process.execPath, ['scripts/check-openapi.mjs', '--check'], {
    cwd: fixture,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});
