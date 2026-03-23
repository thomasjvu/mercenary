import { createHmac } from "node:crypto";
import { buildBossRaidRequestFromDelegateInput } from "@bossraid/api-contracts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  BossRaidResultOutput,
  BossRaidSpawnOutput,
  BossRaidStatusOutput,
  OutputType,
  PrivacyFeatureKey,
  PrivacyRoutingMode,
  RankedSubmission,
  SelectionMode,
  SupportedLanguage,
} from "@bossraid/shared-types";

const apiBase = process.env.BOSSRAID_API_BASE ?? "http://127.0.0.1:8787";
const DEFAULT_DELEGATE_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;
const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>(["csharp", "typescript", "python", "solidity", "text"]);
const OUTPUT_TYPES = new Set<OutputType>(["text", "json", "image", "video", "patch", "bundle"]);
const PRIVACY_ROUTING_MODES = new Set<PrivacyRoutingMode>(["off", "prefer", "strict"]);
const SELECTION_MODES = new Set<SelectionMode>(["best_match", "privacy_first", "cost_first", "diverse_mix"]);
const PRIVACY_FEATURES = new Set<PrivacyFeatureKey>([
  "tee_attested",
  "e2ee",
  "no_data_retention",
  "signed_outputs",
  "provenance_attested",
  "operator_verified",
]);
const TERMINAL_RAID_STATUSES = new Set(["final", "cancelled", "expired"]);
const RAID_ACCESS_TOKEN_HEADER = "x-bossraid-raid-token";

const server = new Server(
  {
    name: "boss-raid",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const tools = [
  {
    name: "bossraid_delegate",
    description:
      "Create a private raid from a coding or analysis task. Requires maxTotalCost, computes missing file hashes, and waits for synthesized output by default.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        system: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        language: { type: "string", enum: [...SUPPORTED_LANGUAGES] },
        framework: { type: "string" },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              sha256: { type: "string" },
            },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
        failingSignals: { type: "object" },
        output: { type: "object" },
        raidPolicy: {
          type: "object",
          description: "Optional native raid policy object. Set raidPolicy.maxTotalCost here if maxTotalCost is not provided at the top level.",
        },
        hostContext: { type: "object" },
        waitForResult: { type: "boolean" },
        timeoutSec: { type: "number" },
        maxAgents: { type: "number" },
        maxTotalCost: {
          description: "Required unless raidPolicy.maxTotalCost is provided.",
          anyOf: [{ type: "number" }, { type: "string" }],
        },
        privacyMode: { type: "string", enum: [...PRIVACY_ROUTING_MODES] },
        requiredCapabilities: {
          type: "array",
          items: { type: "string" },
        },
        minReputationScore: { type: "number" },
        allowedModelFamilies: {
          type: "array",
          items: { type: "string" },
        },
        allowedOutputTypes: {
          type: "array",
          items: { type: "string", enum: [...OUTPUT_TYPES] },
        },
        requirePrivacyFeatures: {
          type: "array",
          items: { type: "string", enum: [...PRIVACY_FEATURES] },
        },
        selectionMode: { type: "string", enum: [...SELECTION_MODES] },
      },
      required: ["prompt"],
      additionalProperties: true,
    },
  },
  {
    name: "bossraid_receipt",
    description: "Return a compact raid receipt with live expert status, synthesized output, ranked contributions, and settlement proof. Pass raid_access_token for public raid reads.",
    inputSchema: {
      type: "object",
      properties: {
        raid_id: { type: "string" },
        raid_access_token: { type: "string" },
      },
      required: ["raid_id"],
      additionalProperties: false,
    },
  },
  {
    name: "bossraid_capabilities",
    description: "Return Boss Raid API routes and MCP adapter metadata.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "bossraid_spawn",
    description: "Create a raid using the native Boss Raid request shape. raidPolicy.maxTotalCost is required.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        taskType: { type: "string" },
        task: { type: "object" },
        output: { type: "object" },
        raidPolicy: { type: "object" },
        hostContext: { type: "object" },
      },
      required: ["agent", "taskType", "task"],
      additionalProperties: true,
    },
  },
  {
    name: "bossraid_status",
    description: "Return the current raid state and provider statuses. Pass raid_access_token for public raid reads.",
    inputSchema: {
      type: "object",
      properties: {
        raid_id: { type: "string" },
        raid_access_token: { type: "string" },
      },
      required: ["raid_id"],
      additionalProperties: false,
    },
  },
  {
    name: "bossraid_result",
    description: "Return the current best or final ranked raid result. Pass raid_access_token for public raid reads.",
    inputSchema: {
      type: "object",
      properties: {
        raid_id: { type: "string" },
        raid_access_token: { type: "string" },
      },
      required: ["raid_id"],
      additionalProperties: false,
    },
  },
  {
    name: "bossraid_abort",
    description: "Cancel an active raid.",
    inputSchema: {
      type: "object",
      properties: {
        raid_id: { type: "string" },
      },
      required: ["raid_id"],
      additionalProperties: false,
    },
  },
  {
    name: "bossraid_replay",
    description: "Re-run evaluation over stored submissions.",
    inputSchema: {
      type: "object",
      properties: {
        raid_id: { type: "string" },
      },
      required: ["raid_id"],
      additionalProperties: false,
    },
  },
  {
    name: "bossraid_provider_stats",
    description: "List provider state used for routing.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...tools],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments == null ? {} : ensureObject(request.params.arguments);

  switch (request.params.name) {
    case "bossraid_delegate":
      return jsonResult(await delegateRaid(args));

    case "bossraid_receipt":
      return jsonResult(
        await buildRaidReceipt(
          asString(args.raid_id, "raid_id"),
          optionalString(args.raid_access_token ?? args.raidAccessToken),
        ),
      );

    case "bossraid_capabilities":
      return textResult(
        JSON.stringify(
          {
            apiBase,
            transport: "http-api-adapter",
            nativeRoute: "POST /v1/raid",
            workflow: {
              highLevel: ["bossraid_delegate", "bossraid_receipt"],
              lowLevel: [
                "bossraid_spawn",
                "bossraid_status",
                "bossraid_result",
                "bossraid_abort",
                "bossraid_replay",
                "bossraid_provider_stats",
              ],
            },
            notes: [
              "bossraid_delegate prefers POST /v1/raid and computes missing file sha256 values.",
              "bossraid_delegate waits for synthesized output by default and falls back to polling guidance when still running.",
              "Public raid status and result reads require the per-raid access token returned at spawn time.",
              "Spawn responses now include receiptPath so callers can open the public proof page directly.",
              "bossraid_receipt combines /v1/raids/:id and /v1/raids/:id/result into one compact proof object.",
            ],
            tools: tools.map((tool) => tool.name),
          },
          null,
          2,
        ),
      );

    case "bossraid_spawn":
      return jsonResult(await apiRequest("/v1/raid", {
        method: "POST",
        body: JSON.stringify(args),
      }));

    case "bossraid_status":
      return jsonResult(
        await getRaidStatus(
          asString(args.raid_id, "raid_id"),
          optionalString(args.raid_access_token ?? args.raidAccessToken),
        ),
      );

    case "bossraid_result":
      return jsonResult(
        await getRaidResult(
          asString(args.raid_id, "raid_id"),
          optionalString(args.raid_access_token ?? args.raidAccessToken),
        ),
      );

    case "bossraid_abort":
      return jsonResult(
        await apiRequest(`/v1/raids/${encodeURIComponent(asString(args.raid_id, "raid_id"))}/abort`, {
          method: "POST",
        }),
      );

    case "bossraid_replay":
      return jsonResult(await apiRequest(`/v1/evaluations/${encodeURIComponent(asString(args.raid_id, "raid_id"))}/replay`, {
        method: "POST",
      }));

    case "bossraid_provider_stats":
      return jsonResult(await apiRequest("/v1/providers"));

    default:
      throw new Error(`Unsupported tool: ${request.params.name}`);
  }
});

async function delegateRaid(args: Record<string, unknown>) {
  const request = buildBossRaidRequestFromDelegateInput(args);
  const spawn = (await apiRequest("/v1/raid", {
    method: "POST",
    body: JSON.stringify(request),
  })) as BossRaidSpawnOutput;
  const waitForResult = asBooleanWithDefault(args.waitForResult ?? args.wait_for_result, true, "waitForResult");

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
      pollTools: ["bossraid_status", "bossraid_result", "bossraid_receipt"],
    };
  }

  const timeoutSec = asPositiveNumberWithDefault(
    args.timeoutSec ?? args.timeout_sec,
    DEFAULT_DELEGATE_TIMEOUT_MS / 1_000,
    "timeoutSec",
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
    const [status, result] = await Promise.all([
      getRaidStatus(raidId, raidAccessToken),
      getRaidResult(raidId, raidAccessToken),
    ]);
    if (result.synthesizedOutput || TERMINAL_RAID_STATUSES.has(status.status)) {
      return {
        timedOut: false,
        receipt: summarizeRaidReceipt(status, result),
      };
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const [status, result] = await Promise.all([
    getRaidStatus(raidId, raidAccessToken),
    getRaidResult(raidId, raidAccessToken),
  ]);
  return {
    timedOut: true,
    receipt: summarizeRaidReceipt(status, result),
  };
}

async function buildRaidReceipt(raidId: string, raidAccessToken?: string) {
  const [status, result] = await Promise.all([
    getRaidStatus(raidId, raidAccessToken),
    getRaidResult(raidId, raidAccessToken),
  ]);
  return summarizeRaidReceipt(status, result);
}

async function getRaidStatus(raidId: string, raidAccessToken?: string): Promise<BossRaidStatusOutput> {
  return (await apiRequest(`/v1/raids/${encodeURIComponent(raidId)}`, {
    headers: raidHeaders(raidAccessToken),
  })) as BossRaidStatusOutput;
}

async function getRaidResult(raidId: string, raidAccessToken?: string): Promise<BossRaidResultOutput> {
  return (await apiRequest(`/v1/raids/${encodeURIComponent(raidId)}/result`, {
    headers: raidHeaders(raidAccessToken),
  })) as BossRaidResultOutput;
}

function summarizeRaidReceipt(status: BossRaidStatusOutput, result: BossRaidResultOutput) {
  return {
    raidId: result.raidId,
    status: status.status,
    firstValidAvailable: status.firstValidAvailable,
    bestCurrentScore: status.bestCurrentScore,
    experts: status.experts.map((expert) => ({
      providerId: expert.providerId,
      status: expert.status,
      latencyMs: expert.latencyMs,
      heartbeatAgeMs: expert.heartbeatAgeMs,
      progress: expert.progress,
      message: expert.message,
    })),
    sanitization: status.sanitization,
    synthesizedOutput:
      result.synthesizedOutput == null
        ? undefined
        : summarizeSynthesizedOutput(result.synthesizedOutput),
    primaryResponse: result.primarySubmission == null ? undefined : summarizePrimarySubmission(result.primarySubmission),
    approvedProviders: (result.approvedSubmissions ?? []).map((entry) => ({
      providerId: entry.submission.providerId,
      rank: entry.rank,
      finalScore: entry.breakdown.finalScore,
      confidence: entry.submission.confidence,
      filesTouched: entry.submission.filesTouched,
    })),
    routingProof:
      result.routingProof == null
        ? undefined
        : {
            policy: result.routingProof.policy,
            providers: result.routingProof.providers.map((decision) => ({
              providerId: decision.providerId,
              phase: decision.phase,
              workstreamLabel: decision.workstreamLabel,
              roleLabel: decision.roleLabel,
              veniceBacked: decision.veniceBacked,
              erc8004Registered: decision.erc8004Registered,
              trustScore: decision.trustScore,
              operatorWallet: decision.operatorWallet,
              registrationTx: decision.registrationTx,
              privacyFeatures: decision.privacyFeatures,
              reasons: decision.reasons,
            })),
          },
    rankedSubmissions: (result.rankedSubmissions ?? []).map((entry) => summarizeRankedSubmission(entry)),
    settlement: result.settlement,
    settlementExecution:
      result.settlementExecution == null
        ? undefined
        : {
            mode: result.settlementExecution.mode,
            proofStandard: result.settlementExecution.proofStandard,
            executedAt: result.settlementExecution.executedAt,
            artifactPath: result.settlementExecution.artifactPath,
            registryRaidRef: result.settlementExecution.registryRaidRef,
            taskHash: result.settlementExecution.taskHash,
            evaluationHash: result.settlementExecution.evaluationHash,
            successfulProviderIds: result.settlementExecution.successfulProviderIds,
            contracts: result.settlementExecution.contracts,
            registryCall: result.settlementExecution.registryCall,
            childJobs: result.settlementExecution.childJobs,
            allocations: result.settlementExecution.allocations,
            transactionHashes: result.settlementExecution.transactionHashes,
            jobIds: result.settlementExecution.jobIds,
          },
    reputationEvents: result.reputationEvents ?? [],
    pollTools: TERMINAL_RAID_STATUSES.has(status.status) ? undefined : ["bossraid_status", "bossraid_result", "bossraid_receipt"],
  };
}

function summarizeSynthesizedOutput(output: NonNullable<BossRaidResultOutput["synthesizedOutput"]>) {
  return {
    primaryType: output.primaryType,
    answerText: output.answerText,
    patchUnifiedDiff: output.patchUnifiedDiff,
    artifacts: output.artifacts,
    explanation: output.explanation,
    baseSubmissionProviderId: output.baseSubmissionProviderId,
    contributingProviderIds: output.contributingProviderIds,
    supportingProviderIds: output.supportingProviderIds,
    droppedProviderIds: output.droppedProviderIds,
    contributions: output.contributions,
    workstreams: output.workstreams,
  };
}

function summarizePrimarySubmission(entry: RankedSubmission) {
  return {
    providerId: entry.submission.providerId,
    contributionRole: entry.submission.contributionRole,
    rank: entry.rank,
    valid: entry.breakdown.valid,
    finalScore: entry.breakdown.finalScore,
    confidence: entry.submission.confidence,
    explanation: entry.submission.explanation,
    answerText: entry.submission.answerText,
    patchUnifiedDiff: entry.submission.patchUnifiedDiff,
    artifacts: entry.submission.artifacts,
    filesTouched: entry.submission.filesTouched,
    invalidReasons: entry.breakdown.invalidReasons,
    summary: entry.breakdown.summary,
  };
}

function summarizeRankedSubmission(entry: RankedSubmission) {
  return {
    providerId: entry.submission.providerId,
    contributionRole: entry.submission.contributionRole,
    rank: entry.rank,
    valid: entry.breakdown.valid,
    finalScore: entry.breakdown.finalScore,
    confidence: entry.submission.confidence,
    invalidReasons: entry.breakdown.invalidReasons,
    summary: entry.breakdown.summary,
    artifacts: entry.submission.artifacts,
    filesTouched: entry.submission.filesTouched,
  };
}

function raidHeaders(raidAccessToken?: string): Record<string, string> | undefined {
  if (!raidAccessToken) {
    return undefined;
  }

  return {
    [RAID_ACCESS_TOKEN_HEADER]: raidAccessToken,
  };
}

async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  let response = await fetch(new URL(path, apiBase), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 402) {
    const paidResponse = await retryWithLocalHmacPayment(path, init, response);
    if (paidResponse) {
      response = paidResponse;
    }
  }

  const text = await response.text();
  const payload = text.length > 0 ? safeParseJson(text) : undefined;

  if (!response.ok) {
    const message =
      response.status === 402 && !process.env.BOSSRAID_X402_VERIFY_HMAC_SECRET
        ? "Boss Raid API requires payment. Set BOSSRAID_X402_VERIFY_HMAC_SECRET for local HMAC retries or disable x402 for private MCP use."
        :
      payload && typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : payload && typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
        : `Boss Raid API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload ?? { ok: true };
}

async function retryWithLocalHmacPayment(path: string, init: RequestInit | undefined, response: Response) {
  const secret = process.env.BOSSRAID_X402_VERIFY_HMAC_SECRET;
  if (!secret) {
    return undefined;
  }

  const paymentRequiredHeader = response.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new Error("Boss Raid API returned 402 without PAYMENT-REQUIRED.");
  }

  const paymentRequired = decodeBase64Json(paymentRequiredHeader);
  const requirement =
    paymentRequired && typeof paymentRequired === "object" && "accepts" in paymentRequired && Array.isArray(paymentRequired.accepts)
      ? paymentRequired.accepts[0]
      : undefined;
  if (!requirement || typeof requirement !== "object") {
    throw new Error("Boss Raid API PAYMENT-REQUIRED header did not include a valid payment requirement.");
  }

  const paymentSignature = encodeBase64Json({
    requirement,
    signature: createHmac("sha256", secret).update(JSON.stringify(requirement)).digest("hex"),
    payer: "bossraid-mcp",
  });
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  headers.set("payment-signature", paymentSignature);

  return await fetch(new URL(path, apiBase), {
    ...init,
    headers,
  });
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function jsonResult(value: unknown) {
  return textResult(JSON.stringify(value, null, 2));
}

function textResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

function ensureObject(value: unknown, field = "object"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object for ${field}.`);
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string for ${field}.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asBooleanWithDefault(value: unknown, fallback: boolean, field: string): boolean {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error(`Expected boolean for ${field}.`);
}

function asPositiveNumberWithDefault(value: unknown, fallback: number, field: string): number {
  if (value == null) {
    return fallback;
  }

  const parsed = asFiniteNumber(value, field);
  if (parsed <= 0) {
    throw new Error(`Expected positive number for ${field}.`);
  }

  return parsed;
}

function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Expected finite number for ${field}.`);
}

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeBase64Json(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
