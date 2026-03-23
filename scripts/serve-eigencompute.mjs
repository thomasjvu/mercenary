import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sandboxSocket = process.env.BOSSRAID_EVAL_SANDBOX_SOCKET ?? "/socket/evaluator.sock";
const sqliteFile = process.env.BOSSRAID_SQLITE_FILE ?? "/data/bossraid-state.sqlite";
const gatewayPort = process.env.PORT ?? process.env.BOSSRAID_GATEWAY_PORT ?? "8080";
const apiPort = process.env.BOSSRAID_API_PORT ?? "8787";
const evaluatorJobIsolation = process.env.BOSSRAID_EVAL_JOB_ISOLATION ?? "process";
const evaluatorJobImage =
  process.env.BOSSRAID_EVAL_JOB_CONTAINER_IMAGE ??
  (evaluatorJobIsolation === "container" ? "bossraid-evaluator-job:eigencompute-local" : undefined);
const dockerSocketPath = process.env.BOSSRAID_EVAL_DOCKER_SOCKET_PATH ?? "/var/run/docker.sock";

const providerSpecs = [
  {
    name: "provider-a",
    port: "9001",
    id: "dottie",
    displayName: "Dottie",
    mode: "pixel_art",
    tokenEnv: "BOSSRAID_PROVIDER_A_TOKEN",
    defaultToken: "bossraid-provider-a",
    instructions: "Specialize in pixel-art asset packs, spritesheets, UI frames, and compact retro palettes.",
  },
  {
    name: "provider-b",
    port: "9002",
    id: "riko",
    displayName: "Riko",
    mode: "remotion",
    tokenEnv: "BOSSRAID_PROVIDER_B_TOKEN",
    defaultToken: "bossraid-provider-b",
    instructions: "Specialize in game marketing videos, teaser hooks, launch copy, and Remotion-ready promo bundles.",
  },
  {
    name: "provider-c",
    port: "9003",
    id: "gamma",
    displayName: "Gamma",
    mode: "gbstudio",
    tokenEnv: "BOSSRAID_PROVIDER_C_TOKEN",
    defaultToken: "bossraid-provider-c",
    instructions: "Specialize in small game-development slices, gameplay logic, and minimal repo patches that keep one clear hook.",
  },
];

await mkdir(dirname(sandboxSocket), { recursive: true });
await mkdir(dirname(sqliteFile), { recursive: true });

const sharedEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "production",
  BOSSRAID_DEPLOY_TARGET: process.env.BOSSRAID_DEPLOY_TARGET ?? "eigencompute",
  BOSSRAID_TEE_PLATFORM: process.env.BOSSRAID_TEE_PLATFORM ?? "eigencompute",
  BOSSRAID_STORAGE_BACKEND: process.env.BOSSRAID_STORAGE_BACKEND ?? "sqlite",
  BOSSRAID_SQLITE_FILE: sqliteFile,
  BOSSRAID_PROVIDERS_FILE: process.env.BOSSRAID_PROVIDERS_FILE ?? "/app/examples/providers.eigencompute.json",
  BOSSRAID_API_HOST: process.env.BOSSRAID_API_HOST ?? "127.0.0.1",
  BOSSRAID_GATEWAY_HOST: process.env.BOSSRAID_GATEWAY_HOST ?? "0.0.0.0",
  BOSSRAID_API_ORIGIN: process.env.BOSSRAID_API_ORIGIN ?? `http://127.0.0.1:${apiPort}`,
  BOSSRAID_PROVIDER_HOST: process.env.BOSSRAID_PROVIDER_HOST ?? "127.0.0.1",
  BOSSRAID_CALLBACK_BASE: process.env.BOSSRAID_CALLBACK_BASE ?? `http://127.0.0.1:${apiPort}`,
  BOSSRAID_EVAL_RUNTIME_EXECUTION: process.env.BOSSRAID_EVAL_RUNTIME_EXECUTION ?? "true",
  BOSSRAID_EVAL_SANDBOX_MODE: "socket",
  BOSSRAID_EVAL_SANDBOX_SOCKET: sandboxSocket,
  BOSSRAID_EVAL_SOCKET_PATH: process.env.BOSSRAID_EVAL_SOCKET_PATH ?? sandboxSocket,
  BOSSRAID_EVAL_SANDBOX_TOKEN: process.env.BOSSRAID_EVAL_SANDBOX_TOKEN ?? "eigencompute-local-eval-token",
  BOSSRAID_EVAL_JOB_ISOLATION: evaluatorJobIsolation,
  ...(evaluatorJobImage ? { BOSSRAID_EVAL_JOB_CONTAINER_IMAGE: evaluatorJobImage } : {}),
  ...(evaluatorJobIsolation === "container" ? { BOSSRAID_EVAL_DOCKER_SOCKET_PATH: dockerSocketPath } : {}),
  BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION: process.env.BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION ?? "false",
};

const processSpecs = [
  {
    name: "evaluator",
    command: "node",
    args: ["apps/evaluator/dist/apps/evaluator/src/index.js"],
    env: {
      ...sharedEnv,
      PORT: process.env.BOSSRAID_EVAL_PORT ?? "8790",
    },
  },
  {
    name: "api",
    command: "node",
    args: ["apps/api/dist/apps/api/src/index.js"],
    env: {
      ...sharedEnv,
      PORT: apiPort,
    },
  },
  ...providerSpecs.map((provider) => {
    const providerToken = process.env[provider.tokenEnv] ?? provider.defaultToken;
    return {
      name: provider.name,
      command: "node",
      args: ["apps/provider-agent/dist/apps/provider-agent/src/index.js"],
      env: {
        ...sharedEnv,
        PORT: provider.port,
        BOSSRAID_PROVIDER_ID: provider.id,
        BOSSRAID_PROVIDER_NAME: provider.displayName,
        BOSSRAID_PROVIDER_TOKEN: providerToken,
        BOSSRAID_CALLBACK_TOKEN: providerToken,
        BOSSRAID_PROVIDER_INSTRUCTIONS: provider.instructions,
        BOSSRAID_PROVIDER_MODE: provider.mode,
      },
    };
  }),
  {
    name: "gateway",
    command: "node",
    args: ["scripts/serve-gateway.mjs"],
    env: {
      ...sharedEnv,
      PORT: gatewayPort,
    },
  },
];

const children = processSpecs.map((processSpec) => {
  const child = spawn(processSpec.command, processSpec.args, {
    cwd: rootDir,
    stdio: "inherit",
    env: processSpec.env,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const exitCode = code ?? 1;
    console.error(`[eigencompute] ${processSpec.name} exited unexpectedly`, signal ?? exitCode);
    shutdown(signal ?? "child_exit", exitCode);
  });

  return child;
});

let shuttingDown = false;

function shutdown(reason, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[eigencompute] shutting down on ${reason}`);
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => {
    process.exit(exitCode);
  }, 1_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
