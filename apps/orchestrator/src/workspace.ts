import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export function resolveWorkspacePath(pathValue: string | undefined, workspaceCwd: string): string | undefined {
  if (!pathValue) {
    return undefined;
  }

  if (isAbsolute(pathValue)) {
    return pathValue;
  }

  return resolve(workspaceCwd, pathValue);
}

export function findWorkspaceRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    if (existsSync(resolve(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}
