import type { ProviderTaskPackage } from '@bossraid/shared-types';
import type { ModelSubmission } from '../types.js';
import type { HarnessRuntimeConfig } from './profile.js';
import {
  executeHarnessTool,
  HARNESS_TOOL_DEFINITIONS,
  type SubmitPayload,
  type ToolCall,
  type ToolResult,
} from './tools.js';
import { createHarnessWorkspace } from './workspace.js';

type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: unknown[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

function buildSystemPrompt(config: HarnessRuntimeConfig, task: ProviderTaskPackage): string {
  const wantsPatch = task.desiredOutput.primaryType === 'patch';
  const skillLine =
    config.skills.length > 0
      ? `Installed skills (disclosed to buyers): ${config.skills.map((s) => s.id).join(', ')}.`
      : 'This is a FRESH harness install (no skills pack).';
  return [
    `You are a Boss Raid agent harness (${config.kind}).`,
    'Work only inside the ephemeral workspace via tools.',
    skillLine,
    wantsPatch
      ? 'For patch tasks: inspect files, edit with write_file, then submit_result with useWorkspaceDiffAsPatch=true.'
      : 'For text/json tasks: investigate with tools if useful, then submit_result with answerText.',
    'Do not invent files that are not in the workspace unless you create them with write_file.',
    'When finished you MUST call submit_result exactly once.',
    `Max tool loop steps: ${config.maxSteps}.`,
  ].join('\n');
}

function buildUserPrompt(task: ProviderTaskPackage): string {
  return [
    `Title: ${task.task.title ?? 'raid task'}`,
    `Description: ${task.task.description ?? ''}`,
    `Primary output: ${task.desiredOutput.primaryType}`,
    task.synthesis
      ? `Workstream: ${task.synthesis.workstreamLabel} — ${task.synthesis.workstreamObjective}`
      : '',
    '',
    'Task package (truncated):',
    JSON.stringify(
      {
        language: task.task.language,
        framework: task.task.framework,
        files: (task.artifacts.files ?? []).map((file) => ({
          path: file.path,
          bytes: file.content.length,
        })),
        errors: task.artifacts.errors,
        tests: task.artifacts.tests,
      },
      null,
      2
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

function parseToolCalls(
  message: NonNullable<OpenAiChatResponse['choices']>[0]['message']
): ToolCall[] {
  const calls = message?.tool_calls ?? [];
  return calls
    .map((call, index) => ({
      id: call.id ?? `tool_${index}`,
      name: call.function?.name ?? '',
      argumentsJson: call.function?.arguments ?? '{}',
    }))
    .filter((call) => call.name);
}

async function callChatCompletions(input: {
  apiBase: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}): Promise<OpenAiChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(new URL('/chat/completions', input.apiBase).toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: HARNESS_TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as OpenAiChatResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Harness chat failed (${response.status})`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function toolResultsToMessages(results: ToolResult[]): ChatMessage[] {
  return results.map((result) => ({
    role: 'tool' as const,
    tool_call_id: result.toolCallId,
    content: result.content,
  }));
}

/**
 * Multi-step agent tool loop for Codex, Grok, GLM, and Chutes (OpenAI-compatible tools).
 * Workspace is ephemeral and disposed after the run.
 */
export async function runAgentHarnessLoop(input: {
  task: ProviderTaskPackage;
  config: HarnessRuntimeConfig;
  apiBase: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  onProgress?: (message: string, progress: number) => void;
}): Promise<ModelSubmission & { harnessTrace: { steps: number; toolCalls: number } }> {
  if (input.config.kind === 'off') {
    throw new Error('Harness mode is off.');
  }

  const workspace = await createHarnessWorkspace(input.task);
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(input.config, input.task) },
    { role: 'user', content: buildUserPrompt(input.task) },
  ];

  let submit: SubmitPayload | undefined;
  let toolCalls = 0;
  let steps = 0;

  try {
    for (let step = 0; step < input.config.maxSteps; step += 1) {
      steps = step + 1;
      input.onProgress?.(
        `Harness ${input.config.kind} step ${steps}/${input.config.maxSteps}`,
        Math.min(0.85, 0.1 + step * 0.1)
      );

      const remainingMs = Math.max(2_000, input.timeoutMs - step * 1_000);
      const response = await callChatCompletions({
        apiBase: input.apiBase,
        apiKey: input.apiKey,
        model: input.model,
        messages,
        timeoutMs: remainingMs,
      });

      const choice = response.choices?.[0];
      const message = choice?.message;
      if (!message) {
        throw new Error('Harness model returned empty message.');
      }

      const calls = parseToolCalls(message);
      messages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });

      if (calls.length === 0) {
        // Model finished without tools — treat content as answer if present.
        const text = message.content?.trim();
        if (text) {
          submit = {
            answerText: text,
            explanation: `Harness ${input.config.kind} completed without further tool calls.`,
            confidence: 0.55,
            useWorkspaceDiffAsPatch: input.task.desiredOutput.primaryType === 'patch',
          };
        }
        break;
      }

      const results: ToolResult[] = [];
      for (const call of calls) {
        toolCalls += 1;
        const executed = await executeHarnessTool(workspace, call);
        results.push(executed.result);
        if (executed.submit) {
          submit = executed.submit;
        }
      }
      messages.push(...toolResultsToMessages(results));

      if (submit) {
        break;
      }
    }

    if (!submit) {
      submit = {
        answerText:
          input.task.desiredOutput.primaryType === 'patch'
            ? undefined
            : 'Harness reached max steps without submit_result.',
        explanation: `Harness ${input.config.kind} stopped after ${steps} steps without explicit submit_result.`,
        confidence: 0.3,
        useWorkspaceDiffAsPatch: input.task.desiredOutput.primaryType === 'patch',
      };
    }

    let patchUnifiedDiff: string | undefined;
    if (submit.useWorkspaceDiffAsPatch || input.task.desiredOutput.primaryType === 'patch') {
      patchUnifiedDiff = await workspace.buildUnifiedDiff();
    }

    const filesTouched = (await workspace.listFiles()).filter((path) => {
      // Prefer files that differ from originals — approximated by listing when patch exists
      return Boolean(patchUnifiedDiff && patchUnifiedDiff.includes(path));
    });

    return {
      patchUnifiedDiff,
      answerText: submit.answerText,
      explanation: submit.explanation,
      confidence: submit.confidence ?? 0.6,
      claimedRootCause: submit.claimedRootCause,
      filesTouched:
        filesTouched.length > 0
          ? filesTouched
          : (input.task.artifacts.files ?? []).map((file) => file.path).slice(0, 20),
      harnessTrace: { steps, toolCalls },
    };
  } finally {
    await workspace.dispose();
  }
}
