import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { RuntimeProbeInput, RuntimeProbeResult } from "@bossraid/shared-types";

const DEFAULT_JOB_TIMEOUT_MS = 45_000;
const FORCE_KILL_GRACE_MS = 1_000;
const DEFAULT_DOCKER_SOCKET_PATH = "/var/run/docker.sock";
const DEFAULT_JOB_CONTAINER_TMPFS_MB = 512;
const DEFAULT_JOB_CONTAINER_MEMORY_MB = 1_024;
const DEFAULT_JOB_CONTAINER_CPUS = 1;
const DEFAULT_JOB_CONTAINER_PIDS_LIMIT = 256;

export type EvaluatorJobIsolation = "process" | "container";

export class RuntimeProbeExecutionError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function readJobTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BOSSRAID_EVAL_JOB_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_JOB_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_JOB_TIMEOUT_MS;
}

export function readJobIsolation(env: NodeJS.ProcessEnv = process.env): EvaluatorJobIsolation {
  return env.BOSSRAID_EVAL_JOB_ISOLATION === "container" ? "container" : "process";
}

export function readWorkerIsolationLabel(env: NodeJS.ProcessEnv = process.env): "per_job_process" | "per_job_container" {
  return readJobIsolation(env) === "container" ? "per_job_container" : "per_job_process";
}

export async function executeRuntimeProbeIsolated(
  input: RuntimeProbeInput,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeProbeResult> {
  if (readJobIsolation(env) === "container") {
    return executeRuntimeProbeInContainer(input, timeoutMs, env);
  }
  return executeRuntimeProbeInSubprocess(input, timeoutMs, env);
}

async function executeRuntimeProbeInSubprocess(
  input: RuntimeProbeInput,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeProbeResult> {
  const workerArgs = resolveWorkerArgs(import.meta.url);
  const payload = JSON.stringify(input);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, workerArgs, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: buildWorkerEnv(env),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid, "SIGTERM");
      forceKillTimer = setTimeout(() => {
        killProcessGroup(child.pid, "SIGKILL");
      }, FORCE_KILL_GRACE_MS);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      reject(new RuntimeProbeExecutionError(
        500,
        "sandbox_worker_spawn_failed",
        error.message,
      ));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }

      if (timedOut) {
        reject(new RuntimeProbeExecutionError(
          504,
          "sandbox_timeout",
          `Runtime probe exceeded ${timeoutMs} ms.`,
        ));
        return;
      }

      if (code !== 0) {
        reject(new RuntimeProbeExecutionError(
          500,
          "sandbox_worker_failed",
          summarizeWorkerFailure(code, signal, stderr),
        ));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as RuntimeProbeResult);
      } catch (error) {
        reject(new RuntimeProbeExecutionError(
          500,
          "sandbox_worker_failed",
          error instanceof Error ? error.message : String(error),
        ));
      }
    });

    child.stdin.end(payload);
  });
}

async function executeRuntimeProbeInContainer(
  input: RuntimeProbeInput,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeProbeResult> {
  const image = env.BOSSRAID_EVAL_JOB_CONTAINER_IMAGE;
  if (!image) {
    throw new RuntimeProbeExecutionError(
      503,
      "sandbox_not_configured",
      "BOSSRAID_EVAL_JOB_CONTAINER_IMAGE is required for container job isolation.",
    );
  }

  const socketPath = env.BOSSRAID_EVAL_DOCKER_SOCKET_PATH ?? DEFAULT_DOCKER_SOCKET_PATH;
  const containerName = `bossraid-eval-job-${randomUUID()}`;
  const payload = JSON.stringify(input);

  return new Promise((resolve, reject) => {
    const child = spawn("docker", buildDockerRunArgs(image, containerName, socketPath, env), {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: buildWorkerEnv(env),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid, "SIGTERM");
      forceKillTimer = setTimeout(() => {
        killProcessGroup(child.pid, "SIGKILL");
      }, FORCE_KILL_GRACE_MS);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      reject(new RuntimeProbeExecutionError(
        503,
        "sandbox_launcher_unavailable",
        error.message,
      ));
    });
    child.on("close", async (code, signal) => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }

      if (timedOut) {
        await removeContainer(socketPath, containerName, env);
        reject(new RuntimeProbeExecutionError(
          504,
          "sandbox_timeout",
          `Runtime probe exceeded ${timeoutMs} ms.`,
        ));
        return;
      }

      if (code !== 0) {
        reject(new RuntimeProbeExecutionError(
          500,
          "sandbox_worker_failed",
          summarizeWorkerFailure(code, signal, stderr),
        ));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as RuntimeProbeResult);
      } catch (error) {
        reject(new RuntimeProbeExecutionError(
          500,
          "sandbox_worker_failed",
          error instanceof Error ? error.message : String(error),
        ));
      }
    });

    child.stdin.end(payload);
  });
}

function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) {
    return;
  }

  try {
    if (process.platform !== "win32") {
      process.kill(-pid, signal);
      return;
    }
    process.kill(pid, signal);
  } catch {
    // Process already exited.
  }
}

function resolveWorkerArgs(currentModuleUrl: string): string[] {
  const useTsx = currentModuleUrl.endsWith(".ts");
  const workerPath = fileURLToPath(new URL(useTsx ? "./job-worker.ts" : "./job-worker.js", currentModuleUrl));
  return useTsx ? ["--import", "tsx", workerPath] : [workerPath];
}

function buildDockerRunArgs(
  image: string,
  containerName: string,
  socketPath: string,
  env: NodeJS.ProcessEnv,
): string[] {
  return [
    "--host",
    `unix://${socketPath}`,
    "run",
    "--rm",
    "--pull",
    "never",
    "--name",
    containerName,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,size=${readPositiveInteger(env.BOSSRAID_EVAL_JOB_CONTAINER_TMPFS_MB, DEFAULT_JOB_CONTAINER_TMPFS_MB)}m`,
    "--memory",
    `${readPositiveInteger(env.BOSSRAID_EVAL_JOB_CONTAINER_MEMORY_MB, DEFAULT_JOB_CONTAINER_MEMORY_MB)}m`,
    "--cpus",
    String(readPositiveNumber(env.BOSSRAID_EVAL_JOB_CONTAINER_CPUS, DEFAULT_JOB_CONTAINER_CPUS)),
    "--pids-limit",
    String(readPositiveInteger(env.BOSSRAID_EVAL_JOB_CONTAINER_PIDS_LIMIT, DEFAULT_JOB_CONTAINER_PIDS_LIMIT)),
    "--user",
    "10001:10001",
    "--workdir",
    "/app",
    "-i",
    image,
    "node",
    "/app/apps/evaluator/dist/apps/evaluator/src/job-worker.js",
  ];
}

async function removeContainer(socketPath: string, containerName: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn(
      "docker",
      [
        "--host",
        `unix://${socketPath}`,
        "rm",
        "-f",
        containerName,
      ],
      {
        cwd: process.cwd(),
        stdio: "ignore",
        env: buildWorkerEnv(env),
      },
    );
    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildWorkerEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    PATH: env.PATH ?? process.env.PATH ?? "",
    HOME: tmpdir(),
    TMPDIR: tmpdir(),
    TMP: tmpdir(),
    TEMP: tmpdir(),
    LANG: env.LANG ?? process.env.LANG ?? "C.UTF-8",
    LC_ALL: env.LC_ALL ?? process.env.LC_ALL ?? "C.UTF-8",
  };
}

function summarizeWorkerFailure(code: number | null, signal: NodeJS.Signals | null, stderr: string): string {
  const detail = stderr.trim().split(/\r?\n/).slice(0, 3).join(" ");
  if (detail) {
    return detail;
  }
  if (signal) {
    return `Runtime probe worker exited via ${signal}.`;
  }
  return `Runtime probe worker exited with code ${code ?? "unknown"}.`;
}
