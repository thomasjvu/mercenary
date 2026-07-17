import { spawn } from 'node:child_process';
import type { ProviderTaskPackage } from '@bossraid/shared-types';
import type { HarnessRuntimeConfig } from '../profile.js';
import type { HarnessSubmission } from '../types.js';
import { createHarnessWorkspace, type HarnessWorkspace } from '../workspace.js';

export type NativeSdkKind = 'claude_agent_sdk' | 'codex_sdk';

function buildAgentPrompt(task: ProviderTaskPackage, config: HarnessRuntimeConfig): string {
  return [
    `You are a Boss Raid ${config.kind} agent harness (native SDK runtime).`,
    'Work only inside the current working directory (ephemeral workspace).',
    config.skills.length > 0
      ? `Installed skills (disclosed): ${config.skills.map((s) => s.id).join(', ')}.`
      : 'Fresh install (no skill pack).',
    `Title: ${task.task.title ?? 'raid task'}`,
    `Description: ${task.task.description ?? ''}`,
    `Primary output: ${task.desiredOutput.primaryType}`,
    task.desiredOutput.primaryType === 'patch'
      ? 'Produce a minimal safe patch; prefer editing files in the workspace.'
      : 'Produce a concise answer as plain text or JSON when appropriate.',
    'When done, summarize what you changed and the final answer clearly.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function runProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(
      () => {
        child.kill('SIGTERM');
        reject(new Error(`Native harness process timed out after ${input.timeoutMs}ms`));
      },
      Math.max(1, input.timeoutMs)
    );

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/** Dynamic import of optional image deps without hard package.json dependency. */
async function importOptionalModule(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional optional runtime load
    const dynamicImport = new Function('s', 'return import(s)') as (
      s: string
    ) => Promise<Record<string, unknown>>;
    return await dynamicImport(specifier);
  } catch {
    return null;
  }
}

async function tryClaudeAgentSdkQuery(input: {
  prompt: string;
  cwd: string;
  apiKey: string;
  model?: string;
}): Promise<string | null> {
  const mod = await importOptionalModule('@anthropic-ai/claude-agent-sdk');
  if (!mod || typeof mod.query !== 'function') {
    return null;
  }
  try {
    const query = mod.query as (args: {
      prompt: string;
      options?: Record<string, unknown>;
    }) => AsyncIterable<{ result?: string; type?: string }>;
    let text = '';
    for await (const message of query({
      prompt: input.prompt,
      options: {
        cwd: input.cwd,
        model: input.model,
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'acceptEdits',
        env: { ...process.env, ANTHROPIC_API_KEY: input.apiKey },
      },
    })) {
      if (message && typeof message === 'object' && 'result' in message && message.result) {
        text = String(message.result);
      }
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function tryCodexSdkRun(input: {
  prompt: string;
  cwd: string;
  apiKey: string;
  model?: string;
}): Promise<string | null> {
  const mod = await importOptionalModule('@openai/codex-sdk');
  const CodexCtor = mod?.Codex as
    | (new (opts?: Record<string, unknown>) => {
        startThread: (opts?: Record<string, unknown>) => {
          run: (prompt: string) => Promise<{ finalResponse?: string }>;
        };
      })
    | undefined;
  if (typeof CodexCtor !== 'function') {
    return null;
  }
  try {
    const codex = new CodexCtor({
      apiKey: input.apiKey,
      workingDirectory: input.cwd,
      model: input.model,
    });
    const thread = codex.startThread({ workingDirectory: input.cwd });
    const result = await thread.run(input.prompt);
    const text = result?.finalResponse?.trim();
    return text || null;
  } catch {
    return null;
  }
}

async function runClaudeCli(input: {
  prompt: string;
  cwd: string;
  apiKey: string;
  model?: string;
  timeoutMs: number;
}): Promise<string> {
  const args = ['-p', input.prompt, '--output-format', 'text'];
  if (input.model) {
    args.push('--model', input.model);
  }
  const result = await runProcess({
    command: process.env.BOSSRAID_CLAUDE_CLI_BIN?.trim() || 'claude',
    args,
    cwd: input.cwd,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: input.apiKey,
    },
    timeoutMs: input.timeoutMs,
  });
  if (result.code !== 0) {
    throw new Error(
      `claude CLI failed (code ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`
    );
  }
  return result.stdout.trim();
}

async function runCodexCli(input: {
  prompt: string;
  cwd: string;
  apiKey: string;
  model?: string;
  timeoutMs: number;
}): Promise<string> {
  // Codex non-interactive: `codex exec` or `codex -q` depending on install; prefer env override.
  const bin = process.env.BOSSRAID_CODEX_CLI_BIN?.trim() || 'codex';
  const args = process.env.BOSSRAID_CODEX_CLI_ARGS?.trim()
    ? process.env.BOSSRAID_CODEX_CLI_ARGS.trim().split(/\s+/)
    : ['exec', '--full-auto', input.prompt];
  const result = await runProcess({
    command: bin,
    args,
    cwd: input.cwd,
    env: {
      ...process.env,
      OPENAI_API_KEY: input.apiKey,
    },
    timeoutMs: input.timeoutMs,
  });
  if (result.code !== 0) {
    throw new Error(
      `codex CLI failed (code ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`
    );
  }
  return result.stdout.trim();
}

async function finishSubmission(
  workspace: HarnessWorkspace,
  task: ProviderTaskPackage,
  answerText: string,
  kind: string
): Promise<HarnessSubmission> {
  let patchUnifiedDiff: string | undefined;
  if (task.desiredOutput.primaryType === 'patch') {
    patchUnifiedDiff = await workspace.buildUnifiedDiff();
  }
  const filesTouched = (await workspace.listFiles()).filter((path) =>
    Boolean(patchUnifiedDiff && patchUnifiedDiff.includes(path))
  );
  return {
    answerText: answerText || undefined,
    explanation: `Native ${kind} harness completed.`,
    confidence: 0.75,
    patchUnifiedDiff,
    filesTouched,
    harnessTrace: { steps: 1, toolCalls: 0 },
  };
}

/**
 * Run Claude Agent SDK or Codex SDK when packages/CLIs are available in the image.
 * Throws if neither SDK nor CLI can run (caller may fall back to openai_tools).
 */
export async function runNativeSdkHarness(input: {
  backend: NativeSdkKind;
  task: ProviderTaskPackage;
  config: HarnessRuntimeConfig;
  apiKey: string;
  model: string;
  timeoutMs: number;
  onProgress?: (message: string, progress: number) => void;
}): Promise<HarnessSubmission> {
  const workspace = await createHarnessWorkspace(input.task);
  const prompt = buildAgentPrompt(input.task, input.config);
  input.onProgress?.(`Native ${input.backend} starting`, 0.15);

  try {
    let answer: string | null = null;

    if (input.backend === 'claude_agent_sdk') {
      answer = await tryClaudeAgentSdkQuery({
        prompt,
        cwd: workspace.root,
        apiKey: input.apiKey,
        model: input.model,
      });
      if (!answer) {
        input.onProgress?.('Claude Agent SDK unavailable; trying claude CLI', 0.25);
        answer = await runClaudeCli({
          prompt,
          cwd: workspace.root,
          apiKey: input.apiKey,
          model: input.model,
          timeoutMs: input.timeoutMs,
        });
      }
    } else {
      answer = await tryCodexSdkRun({
        prompt,
        cwd: workspace.root,
        apiKey: input.apiKey,
        model: input.model,
      });
      if (!answer) {
        input.onProgress?.('Codex SDK unavailable; trying codex CLI', 0.25);
        answer = await runCodexCli({
          prompt,
          cwd: workspace.root,
          apiKey: input.apiKey,
          model: input.model,
          timeoutMs: input.timeoutMs,
        });
      }
    }

    input.onProgress?.(`Native ${input.backend} finished`, 0.9);
    return await finishSubmission(workspace, input.task, answer, input.backend);
  } finally {
    await workspace.dispose();
  }
}
