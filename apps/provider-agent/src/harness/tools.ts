import type { HarnessWorkspace } from './workspace.js';

export type ToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type ToolResult = {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
};

export const HARNESS_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'List files in the ephemeral job workspace (relative paths).',
      parameters: {
        type: 'object',
        properties: {
          maxEntries: { type: 'number', description: 'Max files to return (default 100).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path inside the workspace.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write or overwrite a UTF-8 text file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'submit_result',
      description:
        'Finish the job. Provide answerText and/or mark that workspace edits should become the patch. Call once when done.',
      parameters: {
        type: 'object',
        properties: {
          answerText: { type: 'string' },
          explanation: { type: 'string' },
          confidence: { type: 'number' },
          claimedRootCause: { type: 'string' },
          useWorkspaceDiffAsPatch: {
            type: 'boolean',
            description: 'If true, unified diff of workspace edits becomes patchUnifiedDiff.',
          },
        },
        required: ['explanation'],
        additionalProperties: false,
      },
    },
  },
];

export type SubmitPayload = {
  answerText?: string;
  explanation: string;
  confidence?: number;
  claimedRootCause?: string;
  useWorkspaceDiffAsPatch?: boolean;
};

export async function executeHarnessTool(
  workspace: HarnessWorkspace,
  call: ToolCall
): Promise<{ result: ToolResult; submit?: SubmitPayload }> {
  let args: Record<string, unknown>;
  try {
    args = call.argumentsJson?.trim()
      ? (JSON.parse(call.argumentsJson) as Record<string, unknown>)
      : {};
  } catch {
    return {
      result: {
        toolCallId: call.id,
        name: call.name,
        content: 'Invalid JSON arguments.',
        isError: true,
      },
    };
  }

  try {
    switch (call.name) {
      case 'list_files': {
        const maxEntries =
          typeof args.maxEntries === 'number' && Number.isFinite(args.maxEntries)
            ? Math.max(1, Math.min(200, Math.floor(args.maxEntries)))
            : 100;
        const files = await workspace.listFiles(maxEntries);
        return {
          result: {
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify({ files, count: files.length }),
          },
        };
      }
      case 'read_file': {
        const path = String(args.path ?? '');
        const content = await workspace.readText(path);
        return {
          result: {
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify({ path, content }),
          },
        };
      }
      case 'write_file': {
        const path = String(args.path ?? '');
        const content = String(args.content ?? '');
        const written = await workspace.writeText(path, content);
        return {
          result: {
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify({ ok: true, ...written }),
          },
        };
      }
      case 'submit_result': {
        const explanation =
          typeof args.explanation === 'string' && args.explanation.trim()
            ? args.explanation.trim()
            : 'Completed harness run.';
        const submit: SubmitPayload = {
          answerText: typeof args.answerText === 'string' ? args.answerText : undefined,
          explanation,
          confidence:
            typeof args.confidence === 'number' && Number.isFinite(args.confidence)
              ? Math.max(0, Math.min(1, args.confidence))
              : 0.7,
          claimedRootCause:
            typeof args.claimedRootCause === 'string' ? args.claimedRootCause : undefined,
          useWorkspaceDiffAsPatch: args.useWorkspaceDiffAsPatch === true,
        };
        return {
          result: {
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify({ accepted: true }),
          },
          submit,
        };
      }
      default:
        return {
          result: {
            toolCallId: call.id,
            name: call.name,
            content: `Unknown tool: ${call.name}`,
            isError: true,
          },
        };
    }
  } catch (error) {
    return {
      result: {
        toolCallId: call.id,
        name: call.name,
        content: error instanceof Error ? error.message : String(error),
        isError: true,
      },
    };
  }
}
