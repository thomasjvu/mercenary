import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { countLines } from '@bossraid/raid-core';
import type { SanitizedTaskSpec, TaskFile } from '@bossraid/shared-types';

export interface PatchApplyResult {
  ok: boolean;
  workspacePath: string;
  touchedFiles: string[];
  diffLines: number;
  error?: string;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function normalizeWorkspaceRelativePath(relativePath: string): string {
  if (relativePath.length === 0) {
    throw new Error('workspace path cannot be empty');
  }
  if (relativePath.includes('\0')) {
    throw new Error('workspace path cannot contain null bytes');
  }

  const normalized = posix.normalize(relativePath.replace(/\\/g, '/'));
  if (normalized === '.' || normalized.length === 0) {
    throw new Error('workspace path cannot resolve to the workspace root');
  }
  if (
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    throw new Error(`workspace path must stay relative: ${relativePath}`);
  }

  return normalized;
}

export function resolveWorkspacePath(root: string, relativePath: string): string {
  const workspaceRoot = resolve(root);
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const target = resolve(workspaceRoot, normalized);

  if (!target.startsWith(`${workspaceRoot}${sep}`)) {
    throw new Error(`workspace path escaped the sandbox root: ${relativePath}`);
  }

  return target;
}

async function writeWorkspaceFiles(root: string, files: TaskFile[]): Promise<void> {
  for (const file of files) {
    const target = resolveWorkspacePath(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
}

export async function materializeWorkspace(files: TaskFile[]): Promise<string> {
  const workspacePath = await mkdtemp(join(tmpdir(), 'bossraid-eval-'));
  await writeWorkspaceFiles(workspacePath, files);
  return workspacePath;
}

function stripNoNewlineMarker(lines: string[]): string[] {
  return lines.filter((line) => line !== '\\ No newline at end of file');
}

function parseTouchedFiles(diff: string): string[] {
  return [...new Set([...diff.matchAll(/^\+\+\+\s+b\/(.+)$/gm)].map((match) => match[1]))];
}

function parseDiffSections(diff: string): Array<{ path: string; hunks: string[][] }> {
  const lines = stripNoNewlineMarker(splitLines(diff));
  const sections: Array<{ path: string; hunks: string[][] }> = [];
  let currentPath: string | null = null;
  let currentHunks: string[][] = [];
  let currentHunk: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      if (currentPath) {
        if (currentHunk) {
          currentHunks.push(currentHunk);
          currentHunk = null;
        }
        sections.push({ path: currentPath, hunks: currentHunks });
      }
      currentPath = null;
      currentHunks = [];
      continue;
    }

    if (line.startsWith('+++ b/')) {
      currentPath = line.slice('+++ b/'.length);
      continue;
    }

    if (line.startsWith('@@')) {
      if (currentHunk) {
        currentHunks.push(currentHunk);
      }
      currentHunk = [];
      continue;
    }

    if (currentHunk) {
      currentHunk.push(line);
    }
  }

  if (currentPath) {
    if (currentHunk) {
      currentHunks.push(currentHunk);
    }
    sections.push({ path: currentPath, hunks: currentHunks });
  }

  return sections;
}

function findSequenceIndex(haystack: string[], needle: string[]): number {
  if (needle.length === 0) {
    return 0;
  }

  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return index;
    }
  }

  return -1;
}

function applyHunkToLines(lines: string[], hunk: string[]): string[] {
  const oldChunk = hunk
    .filter((line) => line.startsWith(' ') || line.startsWith('-'))
    .map((line) => line.slice(1));
  const newChunk = hunk
    .filter((line) => line.startsWith(' ') || line.startsWith('+'))
    .map((line) => line.slice(1));

  const index = findSequenceIndex(lines, oldChunk);
  if (index === -1) {
    throw new Error('unable to locate hunk context in file');
  }

  return [...lines.slice(0, index), ...newChunk, ...lines.slice(index + oldChunk.length)];
}

export async function collectFiles(root: string, relative = ''): Promise<string[]> {
  const directory = join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const child = relative ? join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, child)));
      continue;
    }

    if (entry.isFile()) {
      files.push(child);
    }
  }

  return files;
}

export async function snapshotWorkspaceFiles(workspacePath: string): Promise<TaskFile[]> {
  const files = await collectFiles(workspacePath);
  return Promise.all(
    files.map(async (path) => {
      const content = await readFile(join(workspacePath, path), 'utf8');
      return {
        path,
        content,
        sha256: createHash('sha256').update(content).digest('hex'),
      };
    })
  );
}

export async function materializePatchedWorkspace(
  task: SanitizedTaskSpec,
  diff: string
): Promise<PatchApplyResult> {
  const workspacePath = await mkdtemp(join(tmpdir(), 'bossraid-eval-'));
  try {
    await writeWorkspaceFiles(workspacePath, task.files);
    const sections = parseDiffSections(diff);
    const touchedFiles: string[] = [];

    for (const section of sections) {
      const absolutePath = resolveWorkspacePath(workspacePath, section.path);
      const original = await readFile(absolutePath, 'utf8').catch(() => null);
      if (original == null) {
        return {
          ok: false,
          workspacePath,
          touchedFiles,
          diffLines: countLines(diff),
          error: `missing file ${section.path}`,
        };
      }

      let lines = splitLines(original);
      for (const hunk of section.hunks) {
        lines = applyHunkToLines(lines, hunk);
      }

      await writeFile(absolutePath, lines.join('\n'), 'utf8');
      touchedFiles.push(section.path);
    }

    return {
      ok: true,
      workspacePath,
      touchedFiles,
      diffLines: countLines(diff),
    };
  } catch (error) {
    return {
      ok: false,
      workspacePath,
      touchedFiles: parseTouchedFiles(diff),
      diffLines: countLines(diff),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function cleanupWorkspace(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
