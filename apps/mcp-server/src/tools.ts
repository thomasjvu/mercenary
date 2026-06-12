import {
  AGENT_FRAMEWORKS,
  buildBossRaidRequestFromDelegateInput,
  OUTPUT_TYPES,
  PRIVACY_FEATURES,
  PRIVACY_ROUTING_MODES,
  SELECTION_MODES,
  SUPPORTED_LANGUAGES,
} from '@bossraid/api-contracts';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { BossRaidSpawnOutput } from '@bossraid/shared-types';
import { isTerminalRaidStatus, TIMEOUTS } from '@bossraid/constants';
import { pollRaidSnapshot } from '@bossraid/proof-ui';
import { summarizeRaidReceipt } from './receipt.js';
import {
  asBooleanWithDefault,
  asPositiveNumberWithDefault,
  asString,
  ensureObject,
  optionalString,
} from './args.js';
import { apiBase, apiRequest, getRaidResult, getRaidStatus } from './api-client.js';

const DEFAULT_DELEGATE_TIMEOUT_MS = TIMEOUTS.DELEGATE_TIMEOUT;
const POLL_INTERVAL_MS = 500;

export const tools = [
  {
    name: 'bossraid_delegate',
    description:
      'Create a private raid from a coding or analysis task. Requires maxTotalCost, computes missing file hashes, and waits for synthesized output by default.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        system: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        language: { type: 'string', enum: [...SUPPORTED_LANGUAGES] },
        framework: { type: 'string' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              sha256: { type: 'string' },
            },
            required: ['path', 'content'],
            additionalProperties: false,
          },
        },
        failingSignals: { type: 'object' },
        output: { type: 'object' },
        raidPolicy: {
          type: 'object',
          description:
            'Optional native raid policy object. Set raidPolicy.maxTotalCost here if maxTotalCost is not provided at the top level.',
        },
        hostContext: { type: 'object' },
        waitForResult: { type: 'boolean' },
        timeoutSec: { type: 'number' },
        maxAgents: { type: 'number' },
        maxTotalCost: {
          description: 'Required unless raidPolicy.maxTotalCost is provided.',
          anyOf: [{ type: 'number' }, { type: 'string' }],
        },
        privacyMode: {
          type: 'string',
          enum: [...PRIVACY_ROUTING_MODES],
          description:
            'Routing privacy posture. `off` ignores privacy features, `prefer` boosts private providers (playground: prefer private), and `strict` requires verified privacy features and rejects non-compliant routes (playground: strict private).',
        },
        requiredCapabilities: {
          type: 'array',
          items: { type: 'string' },
        },
        minReputationScore: { type: 'number' },
        allowedModelFamilies: {
          type: 'array',
          items: { type: 'string' },
        },
        allowedAgentFrameworks: {
          type: 'array',
          items: { type: 'string', enum: [...AGENT_FRAMEWORKS] },
        },
        allowedModelProviders: {
          type: 'array',
          items: { type: 'string' },
        },
        allowedModelIds: {
          type: 'array',
          items: { type: 'string' },
        },
        allowedOutputTypes: {
          type: 'array',
          items: { type: 'string', enum: [...OUTPUT_TYPES] },
        },
        requirePrivacyFeatures: {
          type: 'array',
          items: { type: 'string', enum: [...PRIVACY_FEATURES] },
        },
        selectionMode: {
          type: 'string',
          enum: [...SELECTION_MODES],
          description:
            'How experts are ranked and selected. `best_match` scores fit, `privacy_first` prioritizes privacy-verified providers, `cost_first` minimizes spend, `diverse_mix` spreads model families, and `round_robin` rotates providers across launches (matches raid playground presets).',
        },
      },
      required: ['prompt'],
      additionalProperties: true,
    },
  },
  {
    name: 'bossraid_receipt',
    description:
      'Return a compact raid receipt with live expert status, synthesized output, ranked contributions, and settlement proof. Pass raid_access_token for public raid reads.',
    inputSchema: {
      type: 'object',
      properties: {
        raid_id: { type: 'string' },
        raid_access_token: { type: 'string' },
      },
      required: ['raid_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'bossraid_capabilities',
    description: 'Return Boss Raid API routes and MCP adapter metadata.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'bossraid_spawn',
    description:
      'Create a raid using the native Boss Raid request shape. raidPolicy.maxTotalCost is required.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        taskType: { type: 'string' },
        task: { type: 'object' },
        output: { type: 'object' },
        raidPolicy: { type: 'object' },
        hostContext: { type: 'object' },
      },
      required: ['agent', 'taskType', 'task'],
      additionalProperties: true,
    },
  },
  {
    name: 'bossraid_status',
    description:
      'Return the current raid state and provider statuses. Pass raid_access_token for public raid reads.',
    inputSchema: {
      type: 'object',
      properties: {
        raid_id: { type: 'string' },
        raid_access_token: { type: 'string' },
      },
      required: ['raid_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'bossraid_result',
    description:
      'Return the current best or final ranked raid result. Pass raid_access_token for public raid reads.',
    inputSchema: {
      type: 'object',
      properties: {
        raid_id: { type: 'string' },
        raid_access_token: { type: 'string' },
      },
      required: ['raid_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'bossraid_abort',
    description: 'Cancel an active raid.',
    inputSchema: {
      type: 'object',
      properties: {
        raid_id: { type: 'string' },
      },
      required: ['raid_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'bossraid_replay',
    description: 'Re-run evaluation over stored submissions.',
    inputSchema: {
      type: 'object',
      properties: {
        raid_id: { type: 'string' },
      },
      required: ['raid_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'bossraid_provider_stats',
    description: 'List provider state used for routing.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

export function registerTools(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...tools],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments == null ? {} : ensureObject(request.params.arguments);

    switch (request.params.name) {
      case 'bossraid_delegate':
        return jsonResult(await delegateRaid(args));

      case 'bossraid_receipt':
        return jsonResult(
          await buildRaidReceipt(
            asString(args.raid_id, 'raid_id'),
            optionalString(args.raid_access_token ?? args.raidAccessToken)
          )
        );

      case 'bossraid_capabilities':
        return textResult(
          JSON.stringify(
            {
              apiBase,
              transport: 'http-api-adapter',
              nativeRoute: 'POST /v1/raid',
              workflow: {
                highLevel: ['bossraid_delegate', 'bossraid_receipt'],
                lowLevel: [
                  'bossraid_spawn',
                  'bossraid_status',
                  'bossraid_result',
                  'bossraid_abort',
                  'bossraid_replay',
                  'bossraid_provider_stats',
                ],
              },
              notes: [
                'bossraid_delegate prefers POST /v1/raid and computes missing file sha256 values.',
                'bossraid_delegate waits for synthesized output by default and falls back to polling guidance when still running.',
                'Public raid status and result reads require the per-raid access token returned at spawn time.',
                'Spawn responses now include receiptPath so callers can open the public proof page directly.',
                'bossraid_receipt combines /v1/raids/:id and /v1/raids/:id/result into one compact proof object.',
                'bossraid_receipt preserves ERC-8004 verification state and ERC-8183 settlement lifecycle proof fields.',
              ],
              tools: tools.map((tool) => tool.name),
            },
            null,
            2
          )
        );

      case 'bossraid_spawn':
        return jsonResult(
          await apiRequest('/v1/raid', {
            method: 'POST',
            body: JSON.stringify(args),
          })
        );

      case 'bossraid_status':
        return jsonResult(
          await getRaidStatus(
            asString(args.raid_id, 'raid_id'),
            optionalString(args.raid_access_token ?? args.raidAccessToken)
          )
        );

      case 'bossraid_result':
        return jsonResult(
          await getRaidResult(
            asString(args.raid_id, 'raid_id'),
            optionalString(args.raid_access_token ?? args.raidAccessToken)
          )
        );

      case 'bossraid_abort':
        return jsonResult(
          await apiRequest(
            `/v1/raids/${encodeURIComponent(asString(args.raid_id, 'raid_id'))}/abort`,
            {
              method: 'POST',
            }
          )
        );

      case 'bossraid_replay':
        return jsonResult(
          await apiRequest(
            `/v1/evaluations/${encodeURIComponent(asString(args.raid_id, 'raid_id'))}/replay`,
            {
              method: 'POST',
            }
          )
        );

      case 'bossraid_provider_stats':
        return jsonResult(await apiRequest('/v1/providers'));

      default:
        throw new Error(`Unsupported tool: ${request.params.name}`);
    }
  });
}

async function delegateRaid(args: Record<string, unknown>) {
  const request = buildBossRaidRequestFromDelegateInput(args);
  const spawn = (await apiRequest('/v1/raid', {
    method: 'POST',
    body: JSON.stringify(request),
  })) as BossRaidSpawnOutput;
  const waitForResult = asBooleanWithDefault(
    args.waitForResult ?? args.wait_for_result,
    true,
    'waitForResult'
  );

  if (!waitForResult) {
    return {
      raidId: spawn.raidId,
      raidAccessToken: spawn.raidAccessToken,
      receiptPath: spawn.receiptPath,
      status: spawn.status,
      selectedExperts: spawn.selectedExperts,
      reserveExperts: spawn.reserveExperts,
      estimatedFirstResultSec: spawn.estimatedFirstResultSec,
      sanitization: spawn.sanitization,
      pollTools: ['bossraid_status', 'bossraid_result', 'bossraid_receipt'],
    };
  }

  const timeoutSec = asPositiveNumberWithDefault(
    args.timeoutSec ?? args.timeout_sec,
    DEFAULT_DELEGATE_TIMEOUT_MS / 1_000,
    'timeoutSec'
  );
  const awaited = await waitForRaidReceipt(spawn.raidId, spawn.raidAccessToken, timeoutSec * 1_000);

  return {
    ...awaited.receipt,
    raidAccessToken: spawn.raidAccessToken,
    receiptPath: spawn.receiptPath,
    dispatch: {
      selectedExperts: spawn.selectedExperts,
      reserveExperts: spawn.reserveExperts,
      estimatedFirstResultSec: spawn.estimatedFirstResultSec,
    },
    timedOut: awaited.timedOut,
  };
}

async function waitForRaidReceipt(raidId: string, raidAccessToken: string, timeoutMs: number) {
  const deadline = Date.now() + Math.max(timeoutMs, 1_000);

  while (Date.now() < deadline) {
    const snapshot = await pollRaidSnapshot({
      fetchStatus: () => getRaidStatus(raidId, raidAccessToken),
      fetchResult: () => getRaidResult(raidId, raidAccessToken),
    });
    if (snapshot.status.status !== 'fulfilled' || snapshot.result.status !== 'fulfilled') {
      throw new Error('Failed to poll raid status or result.');
    }
    const status = snapshot.status.value;
    const result = snapshot.result.value;
    if (result.synthesizedOutput || isTerminalRaidStatus(status.status)) {
      return {
        timedOut: false,
        receipt: summarizeRaidReceipt(status, result),
      };
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const snapshot = await pollRaidSnapshot({
    fetchStatus: () => getRaidStatus(raidId, raidAccessToken),
    fetchResult: () => getRaidResult(raidId, raidAccessToken),
  });
  if (snapshot.status.status !== 'fulfilled' || snapshot.result.status !== 'fulfilled') {
    throw new Error('Failed to poll raid status or result.');
  }
  return {
    timedOut: true,
    receipt: summarizeRaidReceipt(snapshot.status.value, snapshot.result.value),
  };
}

async function buildRaidReceipt(raidId: string, raidAccessToken?: string) {
  const [status, result] = await Promise.all([
    getRaidStatus(raidId, raidAccessToken),
    getRaidResult(raidId, raidAccessToken),
  ]);
  return summarizeRaidReceipt(status, result);
}

function jsonResult(value: unknown) {
  return textResult(JSON.stringify(value, null, 2));
}

function textResult(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
