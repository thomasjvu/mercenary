const RUNTIME_EXECUTION_DISABLED_SUMMARY =
  'Runtime probe disabled by BOSSRAID_EVAL_RUNTIME_EXECUTION=false.';
const SANDBOX_HTTP_URL_MISSING_SUMMARY =
  'Runtime probe disabled because BOSSRAID_EVAL_SANDBOX_URL is not configured.';
const SANDBOX_SOCKET_PATH_MISSING_SUMMARY =
  'Runtime probe disabled because BOSSRAID_EVAL_SANDBOX_SOCKET is not configured.';
const UNSAFE_HOST_EXECUTION_DISABLED_SUMMARY =
  'Runtime probe disabled in production without BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION=true.';

export type RuntimeExecutionTransport = 'disabled' | 'host' | 'http' | 'socket';

function runtimeExecutionRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.BOSSRAID_EVAL_RUNTIME_EXECUTION;
  return value === '1' || value === 'true' || value === 'yes';
}

function readSandboxMode(env: NodeJS.ProcessEnv = process.env): 'host' | 'http' | 'socket' {
  if (env.BOSSRAID_EVAL_SANDBOX_MODE === 'socket') {
    return 'socket';
  }
  return env.BOSSRAID_EVAL_SANDBOX_MODE === 'http' ? 'http' : 'host';
}

export function unsafeHostExecutionAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION;
  return value === '1' || value === 'true' || value === 'yes';
}

export function runtimeExecutionTransport(
  env: NodeJS.ProcessEnv = process.env
): RuntimeExecutionTransport {
  if (!runtimeExecutionRequested(env)) {
    return 'disabled';
  }

  if (readSandboxMode(env) === 'http') {
    return env.BOSSRAID_EVAL_SANDBOX_URL ? 'http' : 'disabled';
  }
  if (readSandboxMode(env) === 'socket') {
    return env.BOSSRAID_EVAL_SANDBOX_SOCKET ? 'socket' : 'disabled';
  }

  if (env.NODE_ENV === 'production' && !unsafeHostExecutionAllowed(env)) {
    return 'disabled';
  }

  return 'host';
}

export function runtimeExecutionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return runtimeExecutionTransport(env) !== 'disabled';
}

export function runtimeExecutionDisabledSummary(env: NodeJS.ProcessEnv = process.env): string {
  if (!runtimeExecutionRequested(env)) {
    return RUNTIME_EXECUTION_DISABLED_SUMMARY;
  }

  if (readSandboxMode(env) === 'http' && !env.BOSSRAID_EVAL_SANDBOX_URL) {
    return SANDBOX_HTTP_URL_MISSING_SUMMARY;
  }
  if (readSandboxMode(env) === 'socket' && !env.BOSSRAID_EVAL_SANDBOX_SOCKET) {
    return SANDBOX_SOCKET_PATH_MISSING_SUMMARY;
  }

  return UNSAFE_HOST_EXECUTION_DISABLED_SUMMARY;
}
