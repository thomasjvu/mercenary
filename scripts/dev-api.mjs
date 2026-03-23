import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);
const sandboxMode = process.env.BOSSRAID_EVAL_SANDBOX_MODE ?? "socket";
const sandboxSocket = process.env.BOSSRAID_EVAL_SANDBOX_SOCKET ?? "/tmp/bossraid-evaluator.sock";
const child = spawn("pnpm", ["--filter", "@bossraid/api", "dev"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: process.env.BOSSRAID_STORAGE_BACKEND ?? "sqlite",
    BOSSRAID_PROVIDERS_FILE: process.env.BOSSRAID_PROVIDERS_FILE ?? "./examples/providers.http.json",
    BOSSRAID_SQLITE_FILE: process.env.BOSSRAID_SQLITE_FILE ?? "./temp/bossraid-state.sqlite",
    BOSSRAID_EVAL_SANDBOX_MODE: sandboxMode,
    ...(sandboxMode === "socket"
      ? {
          BOSSRAID_EVAL_SANDBOX_SOCKET: sandboxSocket,
          BOSSRAID_EVAL_SOCKET_PATH: process.env.BOSSRAID_EVAL_SOCKET_PATH ?? sandboxSocket,
        }
      : {
          BOSSRAID_EVAL_SANDBOX_URL: process.env.BOSSRAID_EVAL_SANDBOX_URL ?? "http://127.0.0.1:8790",
        }),
    BOSSRAID_EVAL_SANDBOX_TOKEN: process.env.BOSSRAID_EVAL_SANDBOX_TOKEN ?? "local-dev-eval-token",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
