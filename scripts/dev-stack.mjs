import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);
const sandboxMode = process.env.BOSSRAID_EVAL_SANDBOX_MODE ?? "socket";
const sandboxSocket = process.env.BOSSRAID_EVAL_SANDBOX_SOCKET ?? "/tmp/bossraid-evaluator.sock";

const processes = [
  {
    name: "evaluator",
    command: "pnpm",
    args: ["--filter", "@bossraid/evaluator", "dev"],
  },
  {
    name: "api",
    command: "node",
    args: ["scripts/dev-api.mjs"],
  },
  {
    name: "web",
    command: "pnpm",
    args: ["--filter", "@bossraid/web", "dev"],
  },
  {
    name: "ops",
    command: "pnpm",
    args: ["--filter", "@bossraid/ops", "dev"],
  },
  {
    name: "providers",
    command: "node",
    args: ["scripts/dev-providers.mjs"],
  },
];

const children = processes.map((processSpec) => {
  const child = spawn(processSpec.command, processSpec.args, {
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
      VITE_BOSSRAID_API_BASE: process.env.VITE_BOSSRAID_API_BASE ?? "http://127.0.0.1:8787",
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[dev] ${processSpec.name} exited via signal ${signal}`);
      return;
    }
    console.log(`[dev] ${processSpec.name} exited with code ${code ?? 0}`);
  });

  return child;
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[dev] shutting down on ${signal}`);
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => {
    process.exit(0);
  }, 250);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
