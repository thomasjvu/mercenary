import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function applyEnvLines(target, raw) {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in target)) {
      target[key] = value;
    }
  }
}

export function loadEnvFile(filePath, options = {}) {
  if (!existsSync(filePath)) {
    return;
  }

  const target = options.into ?? process.env;
  applyEnvLines(target, readFileSync(filePath, "utf8"));
}

export function loadLocalEnv(rootDir) {
  loadEnvFile(resolve(rootDir, ".env"));
}