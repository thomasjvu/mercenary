import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS } from '@bossraid/constants';
import type {
  BuildCheckResult,
  RuntimeProbeResult,
  SanitizedTaskSpec,
  TestCheckResult,
} from '@bossraid/shared-types';
import { runtimeExecutionDisabledSummary, runtimeExecutionTransport } from './transport.js';
import { collectFiles, resolveWorkspacePath, snapshotWorkspaceFiles } from './workspace.js';

interface CommandResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  summary: string;
}

interface InferredTestCommand {
  command: string;
  args: string[];
  summary: string;
}

const SANDBOX_HTTP_URL_MISSING_SUMMARY =
  'Runtime probe disabled because BOSSRAID_EVAL_SANDBOX_URL is not configured.';
const SANDBOX_SOCKET_PATH_MISSING_SUMMARY =
  'Runtime probe disabled because BOSSRAID_EVAL_SANDBOX_SOCKET is not configured.';
const SANDBOX_UNAVAILABLE_PREFIX = 'Runtime probe not available.';

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildCommandEnv(cwd),
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr,
        summary: `Timed out after ${timeoutMs} ms: ${command} ${args.join(' ')}`,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr,
        summary: error.code === 'ENOENT' ? `${command} not available` : error.message,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        summary:
          code === 0
            ? `${command} ${args.join(' ')} passed`
            : `${command} ${args.join(' ')} failed with code ${code ?? 'unknown'}`,
      });
    });
  });
}

function buildCommandEnv(cwd: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    PATH: [
      `${process.cwd()}/node_modules/.bin`,
      env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    ]
      .filter((entry) => entry && entry.length > 0)
      .join(':'),
    HOME: cwd,
    TMPDIR: tmpdir(),
    TMP: tmpdir(),
    TEMP: tmpdir(),
    LANG: env.LANG ?? 'C.UTF-8',
    LC_ALL: env.LC_ALL ?? 'C.UTF-8',
    CI: '1',
    NODE_ENV: 'test',
    DOTNET_CLI_HOME: tmpdir(),
    NUGET_PACKAGES: join(tmpdir(), 'bossraid-nuget'),
    PYTHONPYCACHEPREFIX: join(tmpdir(), 'bossraid-pycache'),
  };
}

function summarizeOutput(result: CommandResult): string {
  const detail = (result.stderr || result.stdout).trim().split(/\r?\n/).slice(0, 3).join(' ');
  return detail ? `${result.summary}: ${detail}` : result.summary;
}

async function getFileExtensions(root: string, files: string[]): Promise<string[]> {
  const extensions = new Set<string>();
  for (const file of files) {
    const absolute = resolveWorkspacePath(root, file);
    const content = await readFile(absolute, 'utf8').catch(() => '');
    if (file.endsWith('.ts')) extensions.add('ts');
    if (file.endsWith('.tsx')) extensions.add('tsx');
    if (file.endsWith('.py')) extensions.add('py');
    if (file.endsWith('.cs')) extensions.add('cs');
    if (file.endsWith('.sol')) extensions.add('sol');
    if (content.includes('import React')) extensions.add('tsx');
  }
  return [...extensions];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function inferProjectTestCommand(
  task: SanitizedTaskSpec,
  workspacePath: string
): Promise<InferredTestCommand | undefined> {
  const allFiles = await collectFiles(workspacePath);

  if (
    task.language === 'csharp' &&
    allFiles.some((file) => file.endsWith('.csproj') || file.endsWith('.sln'))
  ) {
    return {
      command: 'dotnet',
      args: ['test', '--nologo'],
      summary: 'Ran inferred .NET test suite.',
    };
  }

  if (
    task.language === 'python' &&
    allFiles.some(
      (file) => file.startsWith('tests/') || file.endsWith('_test.py') || file.endsWith('test.py')
    )
  ) {
    return {
      command: 'python3',
      args: ['-m', 'unittest', 'discover'],
      summary: 'Ran inferred Python unittest suite.',
    };
  }

  if (await fileExists(join(workspacePath, 'package.json'))) {
    const packageJson = await readFile(join(workspacePath, 'package.json'), 'utf8').catch(() => '');
    try {
      const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
      const testScript = parsed.scripts?.test?.trim();
      if (
        testScript &&
        (testScript === 'node --test' || testScript.startsWith('node --test ')) &&
        allFiles.some((file) => /\.test\.(c|m)?js$/.test(file) || /\.spec\.(c|m)?js$/.test(file))
      ) {
        const commandParts = testScript.split(/\s+/);
        return {
          command: commandParts[0]!,
          args: commandParts.slice(1),
          summary: 'Ran inferred Node built-in test suite.',
        };
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function runLocalBuildProbe(
  task: SanitizedTaskSpec,
  workspacePath: string,
  touchedFiles: string[]
): Promise<BuildCheckResult> {
  const extensions = await getFileExtensions(workspacePath, touchedFiles);

  if (task.language === 'python' || extensions.includes('py')) {
    const pythonFiles = touchedFiles.filter((file) => file.endsWith('.py'));
    if (pythonFiles.length === 0) {
      return {
        passed: true,
        score: 0.55,
        summary: 'No Python files touched; patch applied cleanly.',
      };
    }
    const result = await runCommand(
      'python3',
      ['-m', 'py_compile', ...pythonFiles],
      workspacePath,
      DEFAULTS.SANDBOX_TIMEOUT_MS / 2
    );
    const unavailable = result.summary.includes('not available');
    return {
      passed: result.ok,
      score: result.ok ? 0.95 : unavailable ? 0.35 : 0.15,
      summary: summarizeOutput(result),
    };
  }

  if (task.language === 'typescript' || extensions.includes('ts') || extensions.includes('tsx')) {
    const tsFiles = touchedFiles.filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
    const args = ['--noEmit', '--pretty', 'false', '--skipLibCheck', ...tsFiles];
    const result = await runCommand(
      'tsc',
      args,
      workspacePath,
      (DEFAULTS.SANDBOX_TIMEOUT_MS * 2) / 3
    );
    const unavailable = result.summary.includes('not available');
    return {
      passed: result.ok,
      score: result.ok ? 0.92 : unavailable ? 0.35 : 0.18,
      summary: summarizeOutput(result),
    };
  }

  if (task.language === 'solidity' || extensions.includes('sol')) {
    const result = await runCommand(
      'forge',
      ['build'],
      workspacePath,
      (DEFAULTS.SANDBOX_TIMEOUT_MS * 2) / 3
    );
    const unavailable = result.summary.includes('not available');
    return {
      passed: result.ok,
      score: result.ok ? 0.95 : unavailable ? 0.35 : 0.15,
      summary: summarizeOutput(result),
    };
  }

  if (task.language === 'csharp' || extensions.includes('cs')) {
    const result = await runCommand(
      'dotnet',
      ['build', '--nologo'],
      workspacePath,
      (DEFAULTS.SANDBOX_TIMEOUT_MS * 2) / 3
    );
    const unavailable = result.summary.includes('not available');
    return {
      passed: result.ok,
      score: result.ok ? 0.9 : unavailable ? 0.35 : 0.2,
      summary: summarizeOutput(result),
    };
  }

  return {
    passed: true,
    score: 0.55,
    summary: 'No language-specific build probe available; patch applied cleanly.',
  };
}

export async function runLocalTestProbe(
  task: SanitizedTaskSpec,
  workspacePath: string
): Promise<TestCheckResult> {
  const inferredCommand = await inferProjectTestCommand(task, workspacePath);
  if (inferredCommand) {
    const result = await runCommand(
      inferredCommand.command,
      inferredCommand.args,
      workspacePath,
      (DEFAULTS.SANDBOX_TIMEOUT_MS * 5) / 6
    );
    const unavailable = result.summary.includes('not available');
    return {
      passed: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      score: result.ok ? 1 : unavailable ? 0.35 : 0.1,
      summary: `${inferredCommand.summary} ${summarizeOutput(result)}`,
    };
  }

  const declaredTests = task.failingSignals.tests?.filter((item) => item.trim().length > 0) ?? [];

  if (declaredTests.length === 0) {
    const proxyScore = Math.min(0.45 + (task.failingSignals.reproSteps?.length ?? 0) * 0.08, 0.75);
    return {
      passed: proxyScore >= 0.55 ? 1 : 0,
      failed: proxyScore >= 0.55 ? 0 : 1,
      score: proxyScore,
      summary: 'No regression hints supplied; used repro-count proxy.',
    };
  }

  const proxyScore = Math.min(
    0.5 +
      Math.min(declaredTests.length, 3) * 0.08 +
      Math.min(task.failingSignals.reproSteps?.length ?? 0, 3) * 0.04,
    0.82
  );

  return {
    passed: proxyScore >= 0.55 ? declaredTests.length : 0,
    failed: proxyScore >= 0.55 ? 0 : declaredTests.length,
    score: proxyScore,
    summary: 'Caller-supplied test commands are not executed; used deterministic regression hints.',
  };
}

function unavailableRuntimeProbes(message: string): RuntimeProbeResult {
  return {
    build: {
      passed: true,
      score: 0.45,
      summary: `${SANDBOX_UNAVAILABLE_PREFIX} ${message}`.trim(),
    },
    tests: {
      passed: 0,
      failed: 0,
      score: 0.35,
      summary: `${SANDBOX_UNAVAILABLE_PREFIX} ${message}`.trim(),
    },
  };
}

function readSandboxTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BOSSRAID_EVAL_SANDBOX_TIMEOUT_MS;
  if (!raw) {
    return DEFAULTS.SANDBOX_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULTS.SANDBOX_TIMEOUT_MS;
}

async function runRemoteRuntimeProbes(
  task: SanitizedTaskSpec,
  workspacePath: string,
  touchedFiles: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeProbeResult> {
  const sandboxUrl = env.BOSSRAID_EVAL_SANDBOX_URL;
  if (!sandboxUrl) {
    return unavailableRuntimeProbes(SANDBOX_HTTP_URL_MISSING_SUMMARY);
  }

  const controller = new AbortController();
  const timeoutMs = readSandboxTimeoutMs(env);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = JSON.stringify({
      task,
      files: await snapshotWorkspaceFiles(workspacePath),
      touchedFiles,
    });
    const response = await fetch(new URL('/v1/runtime-probes', sandboxUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.BOSSRAID_EVAL_SANDBOX_TOKEN
          ? { authorization: `Bearer ${env.BOSSRAID_EVAL_SANDBOX_TOKEN}` }
          : {}),
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return unavailableRuntimeProbes(`sandbox request failed: ${response.status}`);
    }

    return (await response.json()) as RuntimeProbeResult;
  } catch (error) {
    return unavailableRuntimeProbes(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

async function postJsonOverSocket(
  socketPath: string,
  route: string,
  body: string,
  token: string | undefined,
  timeoutMs: number
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        method: 'POST',
        socketPath,
        path: route,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body, 'utf8')),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            body: responseBody,
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`sandbox socket request timed out after ${timeoutMs} ms`));
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function runSocketRuntimeProbes(
  task: SanitizedTaskSpec,
  workspacePath: string,
  touchedFiles: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeProbeResult> {
  const socketPath = env.BOSSRAID_EVAL_SANDBOX_SOCKET;
  if (!socketPath) {
    return unavailableRuntimeProbes(SANDBOX_SOCKET_PATH_MISSING_SUMMARY);
  }

  const timeoutMs = readSandboxTimeoutMs(env);
  try {
    const body = JSON.stringify({
      task,
      files: await snapshotWorkspaceFiles(workspacePath),
      touchedFiles,
    });
    const response = await postJsonOverSocket(
      socketPath,
      '/v1/runtime-probes',
      body,
      env.BOSSRAID_EVAL_SANDBOX_TOKEN,
      timeoutMs
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return unavailableRuntimeProbes(`sandbox request failed: ${response.statusCode}`);
    }

    return JSON.parse(response.body) as RuntimeProbeResult;
  } catch (error) {
    return unavailableRuntimeProbes(error instanceof Error ? error.message : String(error));
  }
}

export async function runRuntimeProbes(
  task: SanitizedTaskSpec,
  workspacePath: string,
  touchedFiles: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeProbeResult> {
  const transport = runtimeExecutionTransport(env);

  if (transport === 'disabled') {
    return {
      build: {
        passed: true,
        score: 0.45,
        summary: runtimeExecutionDisabledSummary(env),
      },
      tests: {
        passed: 0,
        failed: 0,
        score: 0.35,
        summary: runtimeExecutionDisabledSummary(env),
      },
    };
  }

  if (transport === 'http') {
    return runRemoteRuntimeProbes(task, workspacePath, touchedFiles, env);
  }
  if (transport === 'socket') {
    return runSocketRuntimeProbes(task, workspacePath, touchedFiles, env);
  }

  return {
    build: await runLocalBuildProbe(task, workspacePath, touchedFiles),
    tests: await runLocalTestProbe(task, workspacePath),
  };
}

export async function runBuildProbe(
  task: SanitizedTaskSpec,
  workspacePath: string,
  touchedFiles: string[]
): Promise<BuildCheckResult> {
  return (await runRuntimeProbes(task, workspacePath, touchedFiles)).build;
}

export async function runTestProbe(
  task: SanitizedTaskSpec,
  workspacePath: string
): Promise<TestCheckResult> {
  return (await runRuntimeProbes(task, workspacePath, [])).tests;
}
