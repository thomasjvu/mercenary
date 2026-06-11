import { rm } from 'node:fs/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import { readPositiveInteger } from '@bossraid/constants';
import { normalizeWorkspaceRelativePath } from '@bossraid/sandbox-runner';
import type { RuntimeProbeInput } from '@bossraid/shared-types';
import {
  RuntimeProbeExecutionError,
  executeRuntimeProbeIsolated,
  readJobTimeoutMs,
  readWorkerIsolationLabel,
} from './subprocess.js';

const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_JOBS = 2;
const DEFAULT_MAX_FILES = 256;
const DEFAULT_MAX_TOTAL_BYTES = 1_048_576;
const DEFAULT_MAX_FILE_BYTES = 262_144;
const DEFAULT_MAX_PATH_LENGTH = 240;
const DEFAULT_EVALUATOR_PORT = 8790;
const DEFAULT_EVALUATOR_HOST = '127.0.0.1';

type RuntimeProbeLimits = {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  maxPathLength: number;
};

function readRuntimeProbeLimits(env: NodeJS.ProcessEnv): RuntimeProbeLimits {
  return {
    maxFiles: readPositiveInteger(env.BOSSRAID_EVAL_MAX_FILES, DEFAULT_MAX_FILES),
    maxTotalBytes: readPositiveInteger(env.BOSSRAID_EVAL_MAX_TOTAL_BYTES, DEFAULT_MAX_TOTAL_BYTES),
    maxFileBytes: readPositiveInteger(env.BOSSRAID_EVAL_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES),
    maxPathLength: readPositiveInteger(env.BOSSRAID_EVAL_MAX_PATH_LENGTH, DEFAULT_MAX_PATH_LENGTH),
  };
}

function requireEvaluatorAuth(env: NodeJS.ProcessEnv, authorization: unknown): boolean {
  const token = env.BOSSRAID_EVAL_SANDBOX_TOKEN;
  if (!token) {
    return true;
  }

  return authorization === `Bearer ${token}`;
}

function assertRuntimeProbeInput(input: RuntimeProbeInput, limits: RuntimeProbeLimits): void {
  if (!Array.isArray(input.files)) {
    throw new Error('Runtime probe files must be an array.');
  }
  if (input.files.length > limits.maxFiles) {
    throw new Error(`Runtime probe file count exceeds limit (${limits.maxFiles}).`);
  }

  let totalBytes = 0;
  for (const file of input.files) {
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new Error('Runtime probe files must include string path and content fields.');
    }
    if (file.path.length > limits.maxPathLength) {
      throw new Error(`Runtime probe path exceeds limit (${limits.maxPathLength}).`);
    }

    normalizeWorkspaceRelativePath(file.path);

    const fileBytes = Buffer.byteLength(file.content, 'utf8');
    if (fileBytes > limits.maxFileBytes) {
      throw new Error(`Runtime probe file exceeds byte limit (${limits.maxFileBytes}).`);
    }
    totalBytes += fileBytes;
  }

  if (totalBytes > limits.maxTotalBytes) {
    throw new Error(`Runtime probe payload exceeds byte limit (${limits.maxTotalBytes}).`);
  }
}

export function buildEvaluatorServer(env: NodeJS.ProcessEnv = process.env): FastifyInstance {
  const limits = readRuntimeProbeLimits(env);
  const bodyLimitBytes = readPositiveInteger(
    env.BOSSRAID_EVAL_BODY_LIMIT_BYTES,
    DEFAULT_BODY_LIMIT_BYTES
  );
  const maxConcurrentJobs = readPositiveInteger(
    env.BOSSRAID_EVAL_MAX_CONCURRENT_JOBS,
    DEFAULT_MAX_CONCURRENT_JOBS
  );
  const app = Fastify({
    bodyLimit: bodyLimitBytes,
  });
  let activeJobs = 0;

  app.get('/health', async () => ({
    ok: true,
    ready: true,
    hasCapacity: activeJobs < maxConcurrentJobs,
    activeJobs,
    maxConcurrentJobs,
    authConfigured: Boolean(env.BOSSRAID_EVAL_SANDBOX_TOKEN),
    bodyLimitBytes,
    listener: env.BOSSRAID_EVAL_SOCKET_PATH ? 'socket' : 'tcp',
    jobTimeoutMs: readJobTimeoutMs(env),
    limits,
    sandbox: readWorkerIsolationLabel(env),
  }));

  app.post('/v1/runtime-probes', async (request, reply) => {
    if (!requireEvaluatorAuth(env, request.headers.authorization)) {
      reply.code(401);
      return {
        error: 'unauthorized',
      };
    }
    if (activeJobs >= maxConcurrentJobs) {
      reply.code(503);
      return {
        error: 'evaluator_capacity_exhausted',
      };
    }

    const input = request.body as RuntimeProbeInput;
    try {
      assertRuntimeProbeInput(input, limits);
    } catch (error) {
      reply.code(400);
      return {
        error: 'invalid_runtime_probe_request',
        message: error instanceof Error ? error.message : String(error),
      };
    }

    activeJobs += 1;
    try {
      return await executeRuntimeProbeIsolated(input, readJobTimeoutMs(env), env);
    } catch (error) {
      if (error instanceof RuntimeProbeExecutionError) {
        reply.code(error.statusCode);
        return {
          error: error.code,
          message: error.message,
        };
      }

      reply.code(500);
      return {
        error: 'sandbox_worker_failed',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      activeJobs -= 1;
    }
  });

  return app;
}

async function startEvaluatorServer() {
  const app = buildEvaluatorServer();
  const socketPath = process.env.BOSSRAID_EVAL_SOCKET_PATH;
  if (socketPath) {
    await rm(socketPath, { force: true });
    await app.listen({ path: socketPath });
    return;
  }

  await app.listen({
    host: process.env.BOSSRAID_EVAL_HOST ?? DEFAULT_EVALUATOR_HOST,
    port: readPositiveInteger(process.env.PORT, DEFAULT_EVALUATOR_PORT),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startEvaluatorServer().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
    process.exit(1);
  });
}
