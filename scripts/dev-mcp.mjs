import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);
const child = spawn("pnpm", ["--filter", "@bossraid/mcp-server", "dev"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    BOSSRAID_API_BASE: process.env.BOSSRAID_API_BASE ?? "http://127.0.0.1:8787",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
