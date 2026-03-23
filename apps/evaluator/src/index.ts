import { chmod, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import Fastify, { type FastifyReply } from "fastify";
import { normalizeWorkspaceRelativePath } from "@bossraid/sandbox-runner";
import type {
  RuntimeProbeInput,
  SanitizedTaskSpec,
  TaskFile,
} from "@bossraid/shared-types";
import {
  executeRuntimeProbeIsolated,
  readJobTimeoutMs,
  readWorkerIsolationLabel,
  RuntimeProbeExecutionError,
} from "./subprocess.js";

interface EvaluatorLimits {
  maxConcurrentJobs: number;
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  maxPathLength: number;
}

class RuntimeProbeValidationError extends Error {}

export function buildEvaluatorServer(env: NodeJS.ProcessEnv = process.env) {
  const authToken = env.BOSSRAID_EVAL_SANDBOX_TOKEN;
  const bodyLimitBytes = readPositiveInteger(env.BOSSRAID_EVAL_BODY_LIMIT_BYTES, 2_097_152);
  const limits = readEvaluatorLimits(env, bodyLimitBytes);
  const jobTimeoutMs = readJobTimeoutMs(env);
  let activeJobs = 0;
  const app = Fastify({
    logger: false,
    bodyLimit: bodyLimitBytes,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RuntimeProbeValidationError) {
      reply.code(400);
      void reply.send({
        error: "invalid_runtime_probe_request",
        message: error.message,
      });
      return;
    }

    if (error instanceof RuntimeProbeExecutionError) {
      reply.code(error.statusCode);
      void reply.send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? ((error as { statusCode: number }).statusCode)
      : 500;
    if (statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode);
      void reply.send({
        error: statusCode === 413 ? "request_too_large" : "bad_request",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    reply.code(500);
    void reply.send({
      error: "internal_error",
    });
  });

  app.get("/health", async () => ({
    ok: true,
    ready: true,
    hasCapacity: activeJobs < limits.maxConcurrentJobs,
    activeJobs,
    maxConcurrentJobs: limits.maxConcurrentJobs,
    authConfigured: Boolean(authToken),
    bodyLimitBytes,
    listener: env.BOSSRAID_EVAL_SOCKET_PATH ? "socket" : "tcp",
    jobTimeoutMs,
    limits: {
      maxFiles: limits.maxFiles,
      maxTotalBytes: limits.maxTotalBytes,
      maxFileBytes: limits.maxFileBytes,
      maxPathLength: limits.maxPathLength,
    },
    sandbox: readWorkerIsolationLabel(env),
  }));

  app.post("/v1/runtime-probes", async (request, reply) => {
    const authError = requireSandboxAuth(reply, request.headers.authorization, authToken);
    if (authError) {
      return authError;
    }

    if (activeJobs >= limits.maxConcurrentJobs) {
      reply.code(503);
      reply.header("retry-after", "1");
      return {
        error: "sandbox_busy",
      };
    }

    const input = parseRuntimeProbeInput(request.body, limits);
    activeJobs += 1;
    try {
      return await executeRuntimeProbeIsolated(input, jobTimeoutMs, env);
    } finally {
      activeJobs -= 1;
    }
  });

  return app;
}

function requireSandboxAuth(
  reply: FastifyReply,
  authorizationHeader: string | string[] | undefined,
  expectedToken: string | undefined,
): { error: string } | undefined {
  if (!expectedToken) {
    return undefined;
  }

  if (asSingleHeader(authorizationHeader) !== `Bearer ${expectedToken}`) {
    reply.code(401);
    return { error: "unauthorized" };
  }

  return undefined;
}

function parseRuntimeProbeInput(value: unknown, limits: EvaluatorLimits): RuntimeProbeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeProbeValidationError("Expected object for runtime probe input.");
  }

  const input = value as Record<string, unknown>;
  const files = parseTaskFiles(input.files, limits);
  const task = parseTask(input.task, files);
  return {
    task,
    files,
    touchedFiles: parseTouchedFiles(input.touchedFiles, files),
  };
}

function parseTask(value: unknown, files: TaskFile[]): SanitizedTaskSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeProbeValidationError("Expected object for runtime probe task.");
  }

  const task = value as Partial<SanitizedTaskSpec>;
  if (typeof task.taskTitle !== "string" || typeof task.taskDescription !== "string") {
    throw new RuntimeProbeValidationError("Expected task title and description for runtime probe task.");
  }
  if (typeof task.language !== "string" || !task.failingSignals || !Array.isArray(task.files)) {
    throw new RuntimeProbeValidationError("Expected language, failingSignals, and files for runtime probe task.");
  }
  if (task.files.length !== files.length) {
    throw new RuntimeProbeValidationError("Task files must match the runtime probe files exactly.");
  }

  const taskFilesByPath = new Map<string, TaskFile>();
  for (const file of task.files) {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new RuntimeProbeValidationError("Task files must be objects.");
    }

    if (
      typeof file.path !== "string" ||
      typeof file.content !== "string" ||
      typeof file.sha256 !== "string"
    ) {
      throw new RuntimeProbeValidationError("Task files must include path, content, and sha256.");
    }

    const normalizedPath = normalizeRuntimeProbePath(file.path);
    taskFilesByPath.set(normalizedPath, {
      path: normalizedPath,
      content: file.content,
      sha256: file.sha256,
    });
  }

  for (const file of files) {
    const taskFile = taskFilesByPath.get(file.path);
    if (!taskFile || taskFile.content !== file.content || taskFile.sha256 !== file.sha256) {
      throw new RuntimeProbeValidationError("Task files must match the runtime probe files exactly.");
    }
  }

  return {
    ...(task as SanitizedTaskSpec),
    files,
  };
}

function parseTaskFiles(value: unknown, limits: EvaluatorLimits): TaskFile[] {
  if (!Array.isArray(value)) {
    throw new RuntimeProbeValidationError("Expected files array for runtime probe input.");
  }
  if (value.length > limits.maxFiles) {
    throw new RuntimeProbeValidationError(
      `Runtime probe file count exceeds limit (${limits.maxFiles}).`,
    );
  }

  let totalBytes = 0;
  const seenPaths = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RuntimeProbeValidationError(`Expected object for runtime probe file ${index}.`);
    }

    const file = item as Record<string, unknown>;
    if (
      typeof file.path !== "string" ||
      typeof file.content !== "string" ||
      typeof file.sha256 !== "string"
    ) {
      throw new RuntimeProbeValidationError(
        `Expected path, content, and sha256 for runtime probe file ${index}.`,
      );
    }

    const normalizedPath = normalizeRuntimeProbePath(file.path);
    const pathLength = Buffer.byteLength(normalizedPath, "utf8");
    if (pathLength > limits.maxPathLength) {
      throw new RuntimeProbeValidationError(
        `Runtime probe path length exceeds limit (${limits.maxPathLength} bytes).`,
      );
    }
    if (seenPaths.has(normalizedPath)) {
      throw new RuntimeProbeValidationError(`Duplicate runtime probe file path: ${normalizedPath}`);
    }
    seenPaths.add(normalizedPath);

    const fileBytes = Buffer.byteLength(file.content, "utf8");
    if (fileBytes > limits.maxFileBytes) {
      throw new RuntimeProbeValidationError(
        `Runtime probe file exceeds per-file limit (${limits.maxFileBytes} bytes): ${normalizedPath}`,
      );
    }
    totalBytes += fileBytes;
    if (totalBytes > limits.maxTotalBytes) {
      throw new RuntimeProbeValidationError(
        `Runtime probe total file bytes exceed limit (${limits.maxTotalBytes}).`,
      );
    }

    return {
      path: normalizedPath,
      content: file.content,
      sha256: file.sha256,
    };
  });
}

function parseTouchedFiles(value: unknown, files: TaskFile[]): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RuntimeProbeValidationError("Expected touchedFiles to be a string array.");
  }

  const knownPaths = new Set(files.map((file) => file.path));
  const seenTouchedFiles = new Set<string>();
  return value.map((item) => {
    const normalizedPath = normalizeRuntimeProbePath(item);
    if (!knownPaths.has(normalizedPath)) {
      throw new RuntimeProbeValidationError(
        `Touched file must exist in the runtime probe workspace: ${normalizedPath}`,
      );
    }
    if (seenTouchedFiles.has(normalizedPath)) {
      throw new RuntimeProbeValidationError(`Duplicate touched file: ${normalizedPath}`);
    }

    seenTouchedFiles.add(normalizedPath);
    return normalizedPath;
  });
}

function asSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeRuntimeProbePath(path: string): string {
  try {
    return normalizeWorkspaceRelativePath(path);
  } catch (error) {
    throw new RuntimeProbeValidationError(error instanceof Error ? error.message : String(error));
  }
}

async function prepareSocketPath(socketPath: string): Promise<void> {
  await mkdir(dirname(socketPath), { recursive: true });
  await rm(socketPath, { force: true }).catch(() => undefined);
}

function readEvaluatorLimits(env: NodeJS.ProcessEnv, bodyLimitBytes: number): EvaluatorLimits {
  const maxConcurrentJobs = readPositiveInteger(env.BOSSRAID_EVAL_MAX_CONCURRENT_JOBS, 2);
  const maxFiles = readPositiveInteger(env.BOSSRAID_EVAL_MAX_FILES, 256);
  const maxTotalBytes = Math.min(
    readPositiveInteger(env.BOSSRAID_EVAL_MAX_TOTAL_BYTES, 1_048_576),
    bodyLimitBytes,
  );
  const maxFileBytes = Math.min(
    readPositiveInteger(env.BOSSRAID_EVAL_MAX_FILE_BYTES, 262_144),
    maxTotalBytes,
  );
  const maxPathLength = readPositiveInteger(env.BOSSRAID_EVAL_MAX_PATH_LENGTH, 240);

  return {
    maxConcurrentJobs,
    maxFiles,
    maxTotalBytes,
    maxFileBytes,
    maxPathLength,
  };
}

async function main() {
  const app = buildEvaluatorServer();
  const port = Number(process.env.PORT ?? "8790");
  const socketPath = process.env.BOSSRAID_EVAL_SOCKET_PATH;
  if (socketPath) {
    await prepareSocketPath(socketPath);
    await app.listen({ path: socketPath });
    await chmod(socketPath, 0o660).catch(() => undefined);
    console.log(`Boss Raid evaluator listening on unix://${socketPath}`);
    registerShutdownHandlers(async () => {
      await app.close();
      await rm(socketPath, { force: true }).catch(() => undefined);
    });
    return;
  }

  const host = process.env.BOSSRAID_EVAL_HOST ?? process.env.HOST ?? "127.0.0.1";
  await app.listen({ host, port });
  console.log(`Boss Raid evaluator listening on http://${host}:${port}`);
  registerShutdownHandlers(async () => {
    await app.close();
  });
}

function registerShutdownHandlers(closeServer: () => Promise<void>): void {
  let closing = false;

  const shutdown = async (signal: string) => {
    if (closing) {
      return;
    }
    closing = true;
    console.log(`Shutting down Boss Raid evaluator after ${signal}`);
    try {
      await closeServer();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
