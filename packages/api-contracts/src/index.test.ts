import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ApiContractError,
  buildBossRaidRequestFromChatCompletion,
  buildBossRaidRequestFromDelegateInput,
  parseAgentHeartbeatInput,
  parseBossRaidRequest,
  parseBossRaidSpawnInput,
  parseChatCompletionRequest,
  parseProviderDiscoveryQuery,
  parseProviderRegistrationInput,
  parseProviderSubmission,
} from "./index.js";

function createBossRaidRequestPayload() {
  return {
    agent: "mercenary-v1",
    taskType: "analysis",
    task: {
      title: "Explain the bug.",
      description: "Inspect the helper and explain the bug.",
      language: "text",
      files: [],
      failingSignals: {
        errors: [],
      },
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text", "json"],
    },
    raidPolicy: {
      maxAgents: 1,
      maxTotalCost: 3.5,
      privacyMode: "prefer",
    },
    hostContext: {
      host: "codex",
    },
  };
}

function createSpawnInputPayload() {
  return {
    taskTitle: "Explain the bug.",
    taskDescription: "Inspect the helper and explain the bug.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text", "json"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 3.5,
      maxLatencySec: 60,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      privacyMode: "prefer",
    },
    rewardPolicy: {
      splitStrategy: "equal_success_only",
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: {
      host: "codex",
    },
  };
}

test("buildBossRaidRequestFromChatCompletion synthesizes the shared chat raid shape", () => {
  const request = buildBossRaidRequestFromChatCompletion(
    parseChatCompletionRequest({
      model: "mercenary-v1",
      messages: [
        {
          role: "system",
          content: "Return one short sentence.",
        },
        {
          role: "user",
          content: "Inspect src/math.ts.",
        },
        {
          role: "assistant",
          content: "ignored",
        },
        {
          role: "user",
          content: "Explain the bug.",
        },
      ],
      raidPolicy: {
        maxAgents: "2",
        maxTotalCost: "4.5",
        minReputationScore: "65",
        requireErc8004: true,
        minTrustScore: "72",
        allowedModelFamilies: ["gpt-4.1"],
        privacyMode: "strict",
        requirePrivacyFeatures: ["signed_outputs"],
        selectionMode: "privacy_first",
      },
    }),
  );

  assert.equal(request.agent, "mercenary-v1");
  assert.equal(request.taskType, "analysis");
  assert.equal(request.task.title, "Explain the bug.");
  assert.equal(
    request.task.description,
    "Return one short sentence.\n\nInspect src/math.ts.\n\nExplain the bug.",
  );
  assert.equal(request.task.language, "text");
  assert.deepEqual(request.task.failingSignals, {
    errors: [],
    expectedBehavior: "Explain the bug.",
  });
  assert.deepEqual(request.output, {
    primaryType: "text",
    artifactTypes: ["text", "json"],
  });
  assert.deepEqual(request.raidPolicy, {
    maxAgents: 2,
    maxTotalCost: 4.5,
    requiredCapabilities: ["analysis"],
    minReputationScore: 65,
    requireErc8004: true,
    minTrustScore: 72,
    allowedModelFamilies: ["gpt-4.1"],
    allowedOutputTypes: ["text", "json"],
    privacyMode: "strict",
    requirePrivacyFeatures: ["signed_outputs"],
    selectionMode: "privacy_first",
  });
  assert.equal(request.hostContext?.host, "codex");
});

test("buildBossRaidRequestFromChatCompletion requires an explicit payout budget", () => {
  assert.throws(
    () =>
      buildBossRaidRequestFromChatCompletion(
        parseChatCompletionRequest({
          model: "mercenary-v1",
          messages: [
            {
              role: "user",
              content: "Explain the bug.",
            },
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === "Expected finite number for chat_completion_request.raid_policy.max_total_cost.",
  );
});

test("buildBossRaidRequestFromDelegateInput infers code-task defaults and file hashes", () => {
  const request = buildBossRaidRequestFromDelegateInput({
    prompt: "Patch the broken add helper.",
    system: "Return a patch and short explanation.",
    files: [
      {
        path: "src/math.ts",
        content: "export function add(a: number, b: number) { return a - b; }\n",
      },
    ],
    maxAgents: "3",
    maxTotalCost: "7.5",
    minReputationScore: "55",
    requireErc8004: true,
    minTrustScore: "70",
    allowedModelFamilies: ["gpt-4.1"],
    privacyMode: "prefer",
    requiredCapabilities: ["analysis", "typescript"],
  });

  assert.equal(request.agent, "mercenary-v1");
  assert.equal(request.taskType, "code_task");
  assert.equal(request.task.title, "Patch the broken add helper.");
  assert.equal(
    request.task.description,
    "Return a patch and short explanation.\n\nPatch the broken add helper.",
  );
  assert.equal(request.task.language, "typescript");
  assert.deepEqual(request.output, {
    primaryType: "patch",
    artifactTypes: ["patch", "text"],
  });
  assert.equal(request.hostContext?.host, "codex");
  assert.equal(request.raidPolicy?.maxAgents, 3);
  assert.equal(request.raidPolicy?.maxTotalCost, 7.5);
  assert.deepEqual(request.raidPolicy?.requiredCapabilities, ["analysis", "typescript"]);
  assert.equal(request.raidPolicy?.minReputationScore, 55);
  assert.equal(request.raidPolicy?.requireErc8004, true);
  assert.equal(request.raidPolicy?.minTrustScore, 70);
  assert.deepEqual(request.raidPolicy?.allowedModelFamilies, ["gpt-4.1"]);
  assert.equal(request.raidPolicy?.privacyMode, "prefer");
  assert.equal(request.raidPolicy?.allowedOutputTypes, undefined);
  assert.equal(request.raidPolicy?.requirePrivacyFeatures, undefined);
  assert.equal(request.raidPolicy?.selectionMode, undefined);
  assert.equal(request.task.files.length, 1);
  assert.equal(request.task.files[0]?.path, "src/math.ts");
  assert.equal(
    request.task.files[0]?.sha256,
    createHash("sha256")
      .update("export function add(a: number, b: number) { return a - b; }\n")
      .digest("hex"),
  );
});

test("buildBossRaidRequestFromDelegateInput rejects unsupported host values", () => {
  assert.throws(
    () =>
      buildBossRaidRequestFromDelegateInput({
        prompt: "Explain the issue.",
        maxTotalCost: 2,
        hostContext: {
          host: "unknown-host",
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError && error.message === "Unsupported host for hostContext.host.",
  );
});

test("buildBossRaidRequestFromDelegateInput requires an explicit payout budget", () => {
  assert.throws(
    () =>
      buildBossRaidRequestFromDelegateInput({
        prompt: "Explain the issue.",
      }),
    (error: unknown) =>
      error instanceof ApiContractError && error.message === "Expected finite number for raidPolicy.maxTotalCost.",
  );
});

test("parseProviderSubmission keeps workstream metadata on contribution roles", () => {
  const submission = parseProviderSubmission(
    {
      raidId: "raid_test",
      providerId: "provider-alpha",
      explanation: "The implementation path is correct, but the answer needs one more edge-case note.",
      answerText: "The helper subtracts instead of adding.",
      confidence: 0.82,
      contribution_role: {
        id: "risk-review",
        label: "Risk Review",
        objective: "Find caveats.",
        workstream_id: "risk",
        workstream_label: "Risk",
        workstream_objective: "Find edge cases and failure modes.",
      },
      files_touched: [],
    },
    "provider-alpha",
  );

  assert.deepEqual(submission.contributionRole, {
    id: "risk-review",
    label: "Risk Review",
    objective: "Find caveats.",
    workstreamId: "risk",
    workstreamLabel: "Risk",
    workstreamObjective: "Find edge cases and failure modes.",
  });
});

test("parseProviderSubmission accepts typed media artifacts", () => {
  const submission = parseProviderSubmission(
    {
      raidId: "raid_media",
      explanation: "Returns a trailer render and a preview sprite sheet.",
      confidence: 0.91,
      artifacts: [
        {
          output_type: "image",
          label: "Boss sprite sheet",
          uri: "https://example.com/art/boss.png",
          mime_type: "image/png",
        },
        {
          outputType: "video",
          label: "Boss intro trailer",
          uri: "https://example.com/video/boss.mp4",
          mimeType: "video/mp4",
        },
      ],
      files_touched: [],
    },
    "provider-media",
  );

  assert.deepEqual(submission.artifacts, [
    {
      outputType: "image",
      label: "Boss sprite sheet",
      uri: "https://example.com/art/boss.png",
      mimeType: "image/png",
      description: undefined,
      sha256: undefined,
    },
    {
      outputType: "video",
      label: "Boss intro trailer",
      uri: "https://example.com/video/boss.mp4",
      mimeType: "video/mp4",
      description: undefined,
      sha256: undefined,
    },
  ]);
});

test("parseBossRaidRequest rejects unsupported task languages", () => {
  assert.throws(
    () =>
      parseBossRaidRequest({
        ...createBossRaidRequestPayload(),
        task: {
          ...createBossRaidRequestPayload().task,
          language: "ruby",
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError && error.message === "Unsupported language for task.language.",
  );
});

test("parseBossRaidRequest requires an explicit payout budget", () => {
  assert.throws(
    () =>
      parseBossRaidRequest({
        ...createBossRaidRequestPayload(),
        raidPolicy: {
          maxAgents: 1,
          privacyMode: "prefer",
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError && error.message === "Expected finite number for raid_policy.max_total_cost.",
  );
});

test("parseBossRaidSpawnInput rejects unsupported host values", () => {
  assert.throws(
    () =>
      parseBossRaidSpawnInput({
        ...createSpawnInputPayload(),
        hostContext: {
          host: "unknown-host",
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError && error.message === "Unsupported host for host_context.host.",
  );
});

test("parseProviderDiscoveryQuery rejects invalid output filters", () => {
  assert.throws(
    () =>
      parseProviderDiscoveryQuery({
        allowedOutputTypes: "text,audio",
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === "Unsupported output type for provider_discovery_query.allowed_output_types[1].",
  );
});

test("parseProviderDiscoveryQuery keeps ERC-8004 trust filters", () => {
  const query = parseProviderDiscoveryQuery({
    requireErc8004: "true",
    minTrustScore: "68",
    minReputationScore: "55",
  });

  assert.equal(query.requireErc8004, true);
  assert.equal(query.minTrustScore, 68);
  assert.equal(query.minReputationScore, 55);
});

test("parseProviderRegistrationInput keeps ERC-8004 identity and trust metadata", () => {
  const registration = parseProviderRegistrationInput({
    agentId: "provider-identity",
    name: "Provider Identity",
    endpoint: "http://127.0.0.1:9001",
    erc8004: {
      agentId: "8004-77",
      operatorWallet: "0xabc",
      registrationTx: "0xtx",
      identityRegistry: "0xidentity",
      reputationRegistry: "0xreputation",
      validationRegistry: "0xvalidation",
      validationTxs: ["0xval1", "0xval2"],
      lastVerifiedAt: "2026-03-22T00:00:00.000Z",
      verification: {
        status: "verified",
        checked_at: "2026-03-23T00:00:00.000Z",
        chain_id: "8453",
        agent_registry: "eip155:8453:0xidentity",
        owner: "0xowner",
        agent_uri: "ipfs://provider-identity",
        registration_tx_found: true,
        operator_matches_owner: true,
        identity_registry_reachable: true,
        reputation_registry_reachable: true,
        validation_registry_reachable: true,
        notes: ["verified against chain data"],
      },
    },
    trust: {
      score: 88,
      reason: "registered and validated",
      source: "erc8004",
    },
  });

  assert.equal(registration.erc8004?.agentId, "8004-77");
  assert.equal(registration.erc8004?.operatorWallet, "0xabc");
  assert.deepEqual(registration.erc8004?.validationTxs, ["0xval1", "0xval2"]);
  assert.equal(registration.erc8004?.verification?.status, "verified");
  assert.equal(registration.erc8004?.verification?.chainId, "8453");
  assert.equal(registration.erc8004?.verification?.operatorMatchesOwner, true);
  assert.equal(registration.trust?.score, 88);
  assert.equal(registration.trust?.source, "erc8004");
});

test("parseProviderRegistrationInput rejects invalid auth types", () => {
  assert.throws(
    () =>
      parseProviderRegistrationInput({
        agentId: "provider-auth",
        name: "Provider Auth",
        endpoint: "http://127.0.0.1:9001",
        auth: {
          type: "jwt",
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError && error.message === "Unsupported provider auth type for provider_auth.type.",
  );
});

test("parseAgentHeartbeatInput rejects invalid provider status values", () => {
  assert.throws(
    () =>
      parseAgentHeartbeatInput({
        agentId: "provider-heartbeat",
        status: "paused",
      }),
    (error: unknown) =>
      error instanceof ApiContractError && error.message === "Unsupported provider status for agent_heartbeat.status.",
  );
});
