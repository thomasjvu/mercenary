import type { HarnessKind } from './profile.js';

/**
 * How the harness executes agent steps.
 * - openai_tools: Boss Raid OpenAI-compatible tool loop (default for all kinds)
 * - claude_agent_sdk: Claude Agent SDK / Claude Code headless (claude_code kind)
 * - codex_sdk: Codex SDK / Codex CLI (codex kind)
 */
export type HarnessRuntimeBackend = 'openai_tools' | 'claude_agent_sdk' | 'codex_sdk';

/**
 * Resolve runtime backend from env + kind.
 *
 * BOSSRAID_HARNESS_RUNTIME_BACKEND=
 *   openai_tools | claude_agent_sdk | codex_sdk | auto
 *
 * auto (default):
 *   claude_code → claude_agent_sdk when BOSSRAID_HARNESS_NATIVE_SDK is 1/true/require
 *   codex → codex_sdk when BOSSRAID_HARNESS_NATIVE_SDK is 1/true/require
 *   else openai_tools
 */
export function resolveHarnessRuntimeBackend(
  kind: HarnessKind,
  env: NodeJS.ProcessEnv = process.env
): HarnessRuntimeBackend {
  const raw = (env.BOSSRAID_HARNESS_RUNTIME_BACKEND ?? 'auto').trim().toLowerCase();
  if (raw === 'openai_tools' || raw === 'tools' || raw === 'loop') {
    return 'openai_tools';
  }
  if (raw === 'claude_agent_sdk' || raw === 'claude_sdk' || raw === 'claude') {
    return 'claude_agent_sdk';
  }
  if (raw === 'codex_sdk' || raw === 'codex') {
    return 'codex_sdk';
  }

  // auto
  const native = (env.BOSSRAID_HARNESS_NATIVE_SDK ?? '').trim().toLowerCase();
  const wantNative = native === '1' || native === 'true' || native === 'require' || native === 'on';
  if (!wantNative) {
    return 'openai_tools';
  }
  if (kind === 'claude_code') {
    return 'claude_agent_sdk';
  }
  if (kind === 'codex') {
    return 'codex_sdk';
  }
  return 'openai_tools';
}

export function nativeSdkRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  const native = (env.BOSSRAID_HARNESS_NATIVE_SDK ?? '').trim().toLowerCase();
  return native === 'require';
}
