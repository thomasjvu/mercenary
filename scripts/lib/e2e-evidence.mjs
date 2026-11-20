import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function clearE2eEvidence(rootDir, name) {
  await rm(resolve(rootDir, 'temp/ci', `${name}.json`), { force: true });
}

// Callers supply only allowlisted result fields, never auth responses or env dumps.
export async function writeE2eEvidence(rootDir, name, evidence) {
  const directory = resolve(rootDir, 'temp/ci');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${name}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceCommit: process.env.GITHUB_SHA ?? process.env.GITEA_SHA ?? null,
        nodeVersion: process.version,
        ...evidence,
      },
      null,
      2
    )}\n`
  );
}
