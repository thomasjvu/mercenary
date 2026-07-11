import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { ProviderTaskPackage } from '@bossraid/shared-types';

export type HarnessWorkspace = {
  root: string;
  listFiles(maxEntries?: number): Promise<string[]>;
  readText(relPath: string, maxBytes?: number): Promise<string>;
  writeText(relPath: string, content: string): Promise<{ path: string; bytes: number }>;
  buildUnifiedDiff(): Promise<string | undefined>;
  dispose(): Promise<void>;
};

const MAX_FILE_BYTES = 256_000;
const MAX_LIST = 200;

function assertInsideRoot(root: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+/u, '').replace(/\0/gu, '');
  if (!cleaned || cleaned.includes('..')) {
    throw new Error(`Path escapes workspace: ${relPath}`);
  }
  const absolute = resolve(root, cleaned);
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) {
    throw new Error(`Path escapes workspace: ${relPath}`);
  }
  return absolute;
}

async function walkFiles(root: string, dir: string, acc: string[]): Promise<void> {
  if (acc.length >= MAX_LIST) {
    return;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (acc.length >= MAX_LIST) {
      return;
    }
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(root, absolute, acc);
      continue;
    }
    if (entry.isFile()) {
      acc.push(relative(root, absolute).split(sep).join('/'));
    }
  }
}

/**
 * Ephemeral per-job workspace seeded from the raid task package files.
 * Wiped after the harness run completes.
 */
export async function createHarnessWorkspace(task: ProviderTaskPackage): Promise<HarnessWorkspace> {
  const root = join(tmpdir(), `bossraid-harness-${randomUUID()}`);
  await mkdir(root, { recursive: true });

  const originals = new Map<string, string>();
  for (const file of task.artifacts.files ?? []) {
    const path = file.path.replace(/^\/+/u, '');
    if (!path || path.includes('..')) {
      continue;
    }
    const absolute = assertInsideRoot(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, 'utf8');
    originals.set(path, file.content);
  }

  const listFiles = async (maxEntries = MAX_LIST): Promise<string[]> => {
    const files: string[] = [];
    await walkFiles(root, root, files);
    return files.slice(0, maxEntries);
  };

  const readText = async (relPath: string, maxBytes = MAX_FILE_BYTES): Promise<string> => {
    const absolute = assertInsideRoot(root, relPath);
    const info = await stat(absolute);
    if (!info.isFile()) {
      throw new Error(`Not a file: ${relPath}`);
    }
    if (info.size > maxBytes) {
      throw new Error(`File too large (${info.size} bytes): ${relPath}`);
    }
    return readFile(absolute, 'utf8');
  };

  const writeText = async (
    relPath: string,
    content: string
  ): Promise<{ path: string; bytes: number }> => {
    const absolute = assertInsideRoot(root, relPath);
    await mkdir(dirname(absolute), { recursive: true });
    const body = content.length > MAX_FILE_BYTES ? content.slice(0, MAX_FILE_BYTES) : content;
    await writeFile(absolute, body, 'utf8');
    return { path: relPath.replace(/^\/+/u, ''), bytes: Buffer.byteLength(body, 'utf8') };
  };

  const buildUnifiedDiff = async (): Promise<string | undefined> => {
    const files = await listFiles();
    const chunks: string[] = [];
    for (const path of files) {
      const current = await readText(path);
      const original = originals.get(path) ?? '';
      if (current === original) {
        continue;
      }
      chunks.push(formatUnifiedDiff(path, original, current));
    }
    return chunks.length > 0 ? chunks.join('\n') : undefined;
  };

  const dispose = async (): Promise<void> => {
    await rm(root, { recursive: true, force: true });
  };

  return {
    root,
    listFiles,
    readText,
    writeText,
    buildUnifiedDiff,
    dispose,
  };
}

function formatUnifiedDiff(path: string, before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const header = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
  ];
  const body = [...beforeLines.map((line) => `-${line}`), ...afterLines.map((line) => `+${line}`)];
  return [...header, ...body].join('\n');
}

export function hashWorkspaceSnapshot(files: Array<{ path: string; content: string }>): string {
  const normalized = files
    .map((file) => `${file.path}\n${file.content}`)
    .sort()
    .join('\n---\n');
  return createHash('sha256').update(normalized).digest('hex');
}
