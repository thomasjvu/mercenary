import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { recoverMessageAddress } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import type {
  ProviderAcceptance,
  ProviderHealthStatus,
  ProviderProfile,
  ProviderTaskPackage,
} from "@bossraid/shared-types";
import { BossRaidOrchestrator } from "@bossraid/orchestrator";
import type { RaidProvider } from "@bossraid/provider-sdk";
import { buildApiServer } from "./index.js";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";
process.env.BOSSRAID_X402_ENABLED = "false";

function createRaidRequestBody() {
  return {
    agent: "mercenary-v1",
    taskType: "code_debugging",
    task: {
      title: "Fix button state bug",
      description: "Save button stays disabled after valid form input.",
      language: "typescript",
      framework: "react",
      files: [
        {
          path: "src/components/Form.tsx",
          content: [
            "export function Form() {",
            "  const disabled = true;",
            "  return <button disabled={disabled}>Save</button>;",
            "}",
          ].join("\n"),
          sha256: "test-file-hash",
        },
      ],
      failingSignals: {
        errors: ["Save button never enables."],
        reproSteps: ["Open form", "Enter valid values", "Observe disabled button"],
      },
    },
    output: {
      primaryType: "patch",
      artifactTypes: ["patch", "text"],
    },
    raidPolicy: {
      maxAgents: 1,
      allowedOutputTypes: ["patch", "text"],
      maxTotalCost: 10,
      privacyMode: "prefer",
    },
    hostContext: {
      host: "codex",
    },
  };
}

function createSpawnInputBody() {
  return {
    taskTitle: "Fix button state bug",
    taskDescription: "Save button stays disabled after valid form input.",
    language: "typescript",
    framework: "react",
    files: [
      {
        path: "src/components/Form.tsx",
        content: [
          "export function Form() {",
          "  const disabled = true;",
          "  return <button disabled={disabled}>Save</button>;",
          "}",
        ].join("\n"),
        sha256: "test-file-hash",
      },
    ],
    failingSignals: {
      errors: ["Save button never enables."],
      reproSteps: ["Open form", "Enter valid values", "Observe disabled button"],
    },
    output: {
      primaryType: "patch",
      artifactTypes: ["patch", "text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 60,
      allowExternalSearch: false,
      requireSpecializations: ["react"],
      minReputation: 0,
      allowedOutputTypes: ["patch", "text"],
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

function createProviderProfile(providerId: string, overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    providerId,
    agentId: providerId,
    displayName: providerId,
    endpointType: "http",
    endpoint: `http://127.0.0.1/${providerId}`,
    specializations: ["react", "analysis"],
    supportedLanguages: ["typescript", "text"],
    supportedFrameworks: ["react"],
    pricePerTaskUsd: 2,
    maxConcurrency: 1,
    status: "available",
    outputTypes: ["patch", "text"],
    privacy: {},
    reputation: {
      globalScore: 0.9,
      responsivenessScore: 0.9,
      validityScore: 0.9,
      qualityScore: 0.9,
      timeoutRate: 0,
      duplicateRate: 0,
      specializationScores: {},
      p50LatencyMs: 500,
      p95LatencyMs: 1_000,
      totalRaids: 10,
      totalSuccessfulRaids: 9,
    },
    ...overrides,
  };
}

function readyHealth(providerId: string): ProviderHealthStatus {
  return {
    providerId,
    endpoint: `http://127.0.0.1/${providerId}`,
    reachable: true,
    ready: true,
  };
}

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }

  return value;
}

function hashText(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition.");
}

test("POST /v1/raid returns 409 when no providers are eligible", async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: "no_eligible_providers",
      message: "No eligible providers are currently available for this raid request.",
    });
  } finally {
    await app.close();
  }
});

test("malformed raid requests return 400", async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "bad_request",
      message: "Expected object for task.",
    });
  } finally {
    await app.close();
  }
});

test("native raid requests require an explicit payout budget", async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

  try {
    const originalBody = createRaidRequestBody();
    const { maxTotalCost: _omittedBudget, ...raidPolicy } = originalBody.raidPolicy;
    const body = {
      ...originalBody,
      raidPolicy,
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: body,
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "bad_request",
      message: "Expected finite number for raid_policy.max_total_cost.",
    });
  } finally {
    await app.close();
  }
});

test("chat completion requests require an explicit payout budget", async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "user",
            content: "Explain the bug.",
          },
        ],
      },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "bad_request",
      message: "Expected finite number for chat_completion_request.raid_policy.max_total_cost.",
    });
  } finally {
    await app.close();
  }
});

test("chat completion requests can use a server-side default payout budget", async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile("provider-chat-default-budget", {
      outputTypes: ["text", "json"],
      supportedLanguages: ["text"],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-chat-default-budget",
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: "provider-chat-default-budget",
        providerRunId: "run-chat-default-budget",
        answerText: "The helper subtracts instead of adding.",
        explanation: "Change subtraction back to addition.",
        confidence: 0.93,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const orchestrator = new BossRaidOrchestrator([provider], undefined, undefined, undefined, async (profile) =>
    readyHealth(profile.providerId),
  );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST: "6",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "mercenary-v1",
        messages: [
          {
            role: "user",
            content: "Explain the bug.",
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().model, "mercenary-v1");
  } finally {
    await app.close();
  }
});

test("POST /v1/chat/completions synthesizes a text raid and returns a multi-provider answer", async () => {
  const receivedTasks: ProviderTaskPackage[] = [];

  const providerA: RaidProvider = {
    profile: createProviderProfile("provider-chat-a", {
      outputTypes: ["text", "json"],
      supportedLanguages: ["text"],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-chat-a",
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: "provider-chat-a",
        providerRunId: "run-chat-a",
        answerText: "The add function subtracts instead of adding.",
        explanation: "The helper returns a - b instead of a + b, so every result is inverted.",
        confidence: 0.92,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const providerB: RaidProvider = {
    profile: createProviderProfile("provider-chat-b", {
      outputTypes: ["text", "json"],
      supportedLanguages: ["text"],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-chat-b",
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: "provider-chat-b",
        providerRunId: "run-chat-b",
        answerText: "The helper returns a - b, so sums are backwards.",
        explanation: "The bug is in the return expression, and the fix is to switch subtraction back to addition.",
        confidence: 0.88,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [providerA, providerB],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 1_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "Return one short sentence.",
          },
          {
            role: "user",
            content: "Inspect the math helper and explain the bug.",
          },
        ],
        raid_policy: {
          max_total_cost: 7,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(receivedTasks[0]?.task.title, "Inspect the math helper and explain the bug.");
    assert.match(receivedTasks[0]?.task.description ?? "", /Return one short sentence\./);
    assert.match(receivedTasks[0]?.task.description ?? "", /Inspect the math helper and explain the bug\./);
    assert.match(receivedTasks[0]?.task.description ?? "", /Assigned workstream:/);
    assert.match(receivedTasks[0]?.task.description ?? "", /Assigned sub-role:/);
    assert.equal(receivedTasks[0]?.task.language, "text");
    assert.equal(receivedTasks[0]?.desiredOutput.primaryType, "text");
    assert.equal(receivedTasks[0]?.synthesis?.totalExperts, 2);
    assert.match(receivedTasks[0]?.synthesis?.focus ?? "", /math helper/i);
    assert.match(receivedTasks[0]?.synthesis?.workstreamObjective ?? "", /math helper/i);
    assert.notEqual(receivedTasks[0]?.synthesis?.roleLabel, receivedTasks[1]?.synthesis?.roleLabel);
    assert.notEqual(receivedTasks[0]?.synthesis?.workstreamLabel, receivedTasks[1]?.synthesis?.workstreamLabel);
    const body = response.json();
    assert.notEqual(receivedTasks[0]?.raidId, body.raid.raid_id);
    assert.notEqual(receivedTasks[1]?.raidId, body.raid.raid_id);
    assert.equal(orchestrator.getRaid(receivedTasks[0]!.raidId)?.parentRaidId, body.raid.raid_id);
    assert.equal(orchestrator.getRaid(receivedTasks[1]!.raidId)?.parentRaidId, body.raid.raid_id);
    assert.match(body.id, /^chatcmpl_/);
    assert.equal(body.object, "chat.completion");
    assert.equal(typeof body.created, "number");
    assert.equal(body.model, "mercenary-v1");
    assert.equal(body.system_fingerprint, "mercenary-v1");
    assert.equal(body.choices[0]?.index, 0);
    assert.equal(body.choices[0]?.message.role, "assistant");
    assert.match(body.choices[0]?.message.content, /subtracts instead of adding|returns a - b/);
    assert.match(body.choices[0]?.message.content, /Risk:/);
    assert.doesNotMatch(body.choices[0]?.message.content, /Supporting workstreams:/);
    assert.equal(body.choices[0]?.finish_reason, "stop");
    assert.match(body.raid.raid_id, /^raid_/);
    assert.equal(typeof body.raid.raid_access_token, "string");
    assert.ok(body.raid.raid_access_token.length > 0);
    assert.equal(body.raid.receipt_path, `/receipt?raidId=${body.raid.raid_id}&token=${body.raid.raid_access_token}`);
    assert.equal(body.raid.agents_invited, 2);
    assert.equal(body.raid.agents_succeeded, 2);
    assert.deepEqual([...body.raid.successful_agents].sort(), ["provider-chat-a", "provider-chat-b"]);
    assert.deepEqual([...body.raid.synthesized_from_agents].sort(), ["provider-chat-a", "provider-chat-b"]);
    assert.equal(body.raid.status, "final");
    assert.ok(body.usage.prompt_tokens > 0);
    assert.ok(body.usage.completion_tokens > 0);
    assert.equal(body.usage.total_tokens, body.usage.prompt_tokens + body.usage.completion_tokens);
  } finally {
    await app.close();
  }
});

test("POST /v1/chat/completions can recurse into nested child raids for larger expert counts", async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const providers = Array.from({ length: 5 }, (_, index): RaidProvider => {
    const providerId = `provider-chat-depth-${index + 1}`;
    return {
      profile: createProviderProfile(providerId, {
        outputTypes: ["text", "json"],
        supportedLanguages: ["text"],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: `run-${providerId}`,
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push(task);
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId,
          providerRunId: `run-${providerId}`,
          answerText: `Depth contribution ${index + 1} isolates one part of the bug.`,
          explanation: `Depth contribution ${index + 1} gives Mercenary another expert signal for the merged answer.`,
          confidence: 0.8,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    };
  });

  const orchestrator = new BossRaidOrchestrator(
    providers,
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 1_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "user",
            content: "Explain the bug directly from multiple expert angles.",
          },
        ],
        raid_policy: {
          max_agents: 5,
          max_total_cost: 17.5,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(receivedTasks.length, 5);
    const body = response.json();
    const nestedTaskRaid = receivedTasks
      .map((task) => orchestrator.getRaid(task.raidId))
      .find((raid) => raid?.parentRaidId && orchestrator.getRaid(raid.parentRaidId)?.parentRaidId === body.raid.raid_id);

    assert.ok(nestedTaskRaid);
    assert.equal(body.raid.agents_invited, 5);
    assert.equal(body.raid.agents_succeeded, 5);
    assert.equal(body.raid.successful_agents.length, 5);
    assert.equal(body.raid.synthesized_from_agents.length, 5);
    assert.equal(body.model, "mercenary-v1");
  } finally {
    await app.close();
  }
});

test("POST /v1/chat/completions supports streaming on the v1 route", async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile("provider-chat-stream", {
      outputTypes: ["text", "json"],
      supportedLanguages: ["text"],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-chat-stream",
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: "provider-chat-stream",
        providerRunId: "run-chat-stream",
        answerText: "The add helper subtracts instead of adding.",
        explanation: "Switch the arithmetic operator back to addition.",
        confidence: 0.94,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const orchestrator = new BossRaidOrchestrator([provider], undefined, undefined, undefined, async (profile) =>
    readyHealth(profile.providerId),
  );
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "mercenary-v1",
        stream: true,
        messages: [
          {
            role: "user",
            content: "Explain the bug.",
          },
        ],
        raid_policy: {
          max_total_cost: 6,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /text\/event-stream/);
    assert.match(response.payload, /chat\.completion\.chunk/);
    assert.match(response.payload, /mercenary-v1/);
    assert.match(response.payload, /The add helper subtracts instead of adding\./);
    assert.match(response.payload, /\[DONE\]/);
  } finally {
    await app.close();
  }
});

test("unknown raid routes return 404 for authorized readers", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/raid/raid_missing",
      headers: {
        authorization: "Bearer admin-secret",
      },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: "not_found",
      message: "Unknown raid: raid_missing",
    });
  } finally {
    await app.close();
  }
});

test("raid status and result require the issued raid access token", async () => {
  const provider = {
    profile: createProviderProfile("provider-reads"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-reads",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Summarize the memo",
    taskDescription: "Review the memo and summarize the main risks.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text"],
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
  });
  const app = buildApiServer(orchestrator, {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
  });

  try {
    assert.ok(spawn.raidAccessToken.length > 10);
    assert.equal(spawn.receiptPath, `/receipt?raidId=${spawn.raidId}&token=${spawn.raidAccessToken}`);

    const unauthorizedStatus = await app.inject({
      method: "GET",
      url: `/v1/raid/${spawn.raidId}`,
    });
    assert.equal(unauthorizedStatus.statusCode, 401);

    const authorizedStatus = await app.inject({
      method: "GET",
      url: `/v1/raid/${spawn.raidId}`,
      headers: {
        "x-bossraid-raid-token": spawn.raidAccessToken,
      },
    });
    assert.equal(authorizedStatus.statusCode, 200);
    assert.equal(authorizedStatus.json().raidId, spawn.raidId);

    const authorizedResult = await app.inject({
      method: "GET",
      url: `/v1/raid/${spawn.raidId}/result`,
      headers: {
        "x-bossraid-raid-token": spawn.raidAccessToken,
      },
    });
    assert.equal(authorizedResult.statusCode, 200);
    assert.equal(authorizedResult.json().raidId, spawn.raidId);

    const adminBypass = await app.inject({
      method: "GET",
      url: `/v1/raids/${spawn.raidId}`,
      headers: {
        authorization: "Bearer admin-secret",
      },
    });
    assert.equal(adminBypass.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("public manifest route describes Mercenary and the native raid flow", async () => {
  const provider = {
    profile: createProviderProfile("provider-manifest", {
      erc8004: {
        agentId: "agent-manifest-provider",
        operatorWallet: "0x00000000000000000000000000000000000000a1",
        registrationTx: "0xregprovider",
        identityRegistry: "0x00000000000000000000000000000000000000b1",
        reputationRegistry: "0x00000000000000000000000000000000000000c1",
        validationRegistry: "0x00000000000000000000000000000000000000d1",
        validationTxs: ["0xvalprovider"],
      },
      trust: {
        score: 91,
        reason: "registered and validated via ERC-8004",
        source: "erc8004",
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-manifest",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const app = buildApiServer(orchestrator, {
    BOSSRAID_ERC8004_AGENT_ID: "mercenary-mainnet-8004",
    BOSSRAID_ERC8004_OPERATOR_WALLET: "0x00000000000000000000000000000000000000aa",
    BOSSRAID_ERC8004_REGISTRATION_TX: "0xregmercenary",
    BOSSRAID_ERC8004_IDENTITY_REGISTRY: "0x00000000000000000000000000000000000000bb",
    BOSSRAID_ERC8004_REPUTATION_REGISTRY: "0x00000000000000000000000000000000000000cc",
    BOSSRAID_ERC8004_VALIDATION_REGISTRY: "0x00000000000000000000000000000000000000dd",
    BOSSRAID_ERC8004_VALIDATION_TXS: "0xvalmercenary",
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/agent.json",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8");

    const body = response.json();
    assert.equal(body.schemaVersion, "bossraid-agent-manifest/v1");
    assert.equal(body.agent.id, "mercenary-v1");
    assert.equal(body.agent.identity.status, "registered");
    assert.equal(body.agent.identity.agentId, "mercenary-mainnet-8004");
    assert.equal(body.endpoints.nativeRaid, "POST /v1/raid");
    assert.equal(body.endpoints.agentLogTemplate, "GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>");
    assert.equal(body.computeConstraints.providerTransport, "http");
    assert.equal(body.computeConstraints.maxEvaluatorJobs, 2);
    assert.equal(body.providerPool.totalProviders, 1);
    assert.deepEqual(body.providerPool.providerIds, ["provider-manifest"]);
    assert.equal(body.providerPool.erc8004RegisteredProviders, 1);
    assert.equal(body.providerPool.trustScoredProviders, 1);
    assert.equal(body.providerPool.averageTrustScore, 91);
  } finally {
    await app.close();
  }
});

test("per-raid agent log route accepts the raid access token as a query parameter", async () => {
  const provider = {
    profile: createProviderProfile("provider-agent-log", {
      modelFamily: "venice",
      privacy: {
        noDataRetention: true,
        teeAttested: true,
      },
      erc8004: {
        agentId: "erc8004-agent-log",
        registrationTx: "0xagentlog",
        operatorWallet: "0xoperator",
        verification: {
          status: "verified",
          checkedAt: "2026-03-23T00:00:00.000Z",
          agentRegistry: "0xidentityregistry",
          agentUri: "ipfs://erc8004-agent-log",
          registrationTxFound: true,
          operatorMatchesOwner: true,
        },
      },
      trust: {
        score: 88,
        source: "erc8004",
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-agent-log",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Inspect the incident notes",
    taskDescription: "Review the notes and summarize the likely cause.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text"],
      privacyMode: "strict",
      requireErc8004: true,
      minTrustScore: 80,
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
  });
  const app = buildApiServer(orchestrator, {});

  try {
    const response = await app.inject({
      method: "GET",
      url: `/v1/raids/${spawn.raidId}/agent_log.json?token=${encodeURIComponent(spawn.raidAccessToken)}`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "private, no-store");

    const body = response.json();
    assert.equal(body.schemaVersion, "bossraid-agent-log/v1");
    assert.equal(body.source.kind, "derived_from_raid_state");
    assert.equal(body.run.raidId, spawn.raidId);
    assert.equal(body.run.host, "codex");
    assert.equal(body.run.receiptPath, `/receipt?raidId=${spawn.raidId}&token=${spawn.raidAccessToken}`);
    assert.equal(body.task.constraints.privacyMode, "strict");
    assert.equal(body.task.constraints.requireErc8004, true);
    assert.equal(body.routing.policy.venicePrivateLane, true);
    assert.equal(body.routing.providers[0].veniceBacked, true);
    assert.equal(body.routing.providers[0].erc8004Registered, true);
    assert.equal(body.routing.providers[0].erc8004VerificationStatus, "verified");
    assert.equal(body.routing.providers[0].agentRegistry, "0xidentityregistry");
    assert.equal(body.routing.providers[0].registrationTx, "0xagentlog");
    assert.equal(body.finalOutput.routingPolicy.requireErc8004, true);
  } finally {
    await app.close();
  }
});

test("raid result exposes ERC-8183-aligned settlement proof data", async () => {
  const provider = {
    profile: createProviderProfile("provider-settlement-proof"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-settlement-proof",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 1_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Explain the form regression",
    taskDescription: "Inspect the flow and explain why the form remains disabled.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text"],
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
  });
  const raid = orchestrator.getRaid(spawn.raidId)!;
  raid.status = "final";
  raid.updatedAt = new Date().toISOString();
  raid.settlementExecution = {
    mode: "file",
    proofStandard: "erc8183_aligned",
    lifecycleStatus: "synthetic",
    executedAt: new Date().toISOString(),
    artifactPath: "temp/settlements/mock.json",
    registryRaidRef: "1",
    taskHash: "0xtaskhash",
    evaluationHash: "0xevaluationhash",
    successfulProviderIds: ["provider-settlement-proof"],
    allocations: [
      {
        providerId: "provider-settlement-proof",
        role: "successful",
        status: "complete",
        totalAmount: 10,
      },
    ],
    contracts: {
      registryAddress: "0x0000000000000000000000000000000000000101",
      escrowAddress: "0x0000000000000000000000000000000000000102",
      tokenAddress: "0x0000000000000000000000000000000000000103",
      clientAddress: "0x0000000000000000000000000000000000000104",
      evaluatorAddress: "0x0000000000000000000000000000000000000105",
      chainId: "8453",
    },
    registryCall: {
      method: "finalizeRaid",
      args: ["1", "0xevaluationhash"],
    },
    childJobs: [
      {
        jobRef: "raid_1:provider-settlement-proof",
        providerId: "provider-settlement-proof",
        providerAddress: "0x0000000000000000000000000000000000000106",
        role: "analysis",
        status: "complete",
        requestedAction: "complete",
        lifecycleStatus: "synthetic",
        budgetUsd: 10,
        budgetAtomic: "10000000",
        submitResultHash: "0xsubmissionhash",
        completionPolicy: "submit and complete child job",
        nextAction: "Switch to onchain settlement mode to create ERC-8183 child jobs.",
        syntheticJobId: "job_1",
      },
    ],
    warnings: ["synthetic settlement record"],
    transactionHashes: ["0xsettlementtx"],
    jobIds: ["1"],
  };
  const app = buildApiServer(orchestrator, {});

  try {
    const response = await app.inject({
      method: "GET",
      url: `/v1/raids/${spawn.raidId}/result`,
      headers: {
        "x-bossraid-raid-token": spawn.raidAccessToken,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.settlementExecution.proofStandard, "erc8183_aligned");
    assert.equal(body.settlementExecution.lifecycleStatus, "synthetic");
    assert.equal(body.settlementExecution.registryRaidRef, "1");
    assert.deepEqual(body.settlementExecution.registryCall.args, ["1", "0xevaluationhash"]);
    assert.equal(body.settlementExecution.contracts.registryAddress.length > 0, true);
    assert.equal(body.settlementExecution.contracts.escrowAddress.length > 0, true);
    assert.equal(body.settlementExecution.childJobs.length, 1);
    assert.equal(body.settlementExecution.childJobs[0].providerId, "provider-settlement-proof");
    assert.equal(body.settlementExecution.childJobs[0].requestedAction, "complete");
    assert.equal(body.settlementExecution.warnings[0], "synthetic settlement record");
    assert.equal(body.routingProof.providers[0].providerId, "provider-settlement-proof");
  } finally {
    await app.close();
  }
});

test("provider submit requires the active providerRunId", async () => {
  const provider = {
    profile: createProviderProfile("provider-alpha"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-alpha",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator([provider], {
    inviteAcceptMs: 1_000,
    firstHeartbeatMs: 1_000,
    hardExecutionMs: 1_000,
    raidAbsoluteMs: 1_000,
  }, undefined, undefined, async (profile) => readyHealth(profile.providerId));
  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Summarize the memo",
    taskDescription: "Review the memo and summarize the main risks.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text"],
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
  });

  await waitFor(() =>
    orchestrator.getRaid(spawn.raidId)?.assignments["provider-alpha"]?.providerRunId === "run-alpha",
  );

  const app = buildApiServer(orchestrator);

  try {
    const missingRunId = await app.inject({
      method: "POST",
      url: "/v1/providers/provider-alpha/submit",
      payload: {
        raidId: spawn.raidId,
        answerText: "Main risk is stale provider state.",
        explanation: "The memo points to stale routing state as the main system risk.",
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(missingRunId.statusCode, 409);
    assert.equal(missingRunId.json().error, "provider_run_required");

    const wrongRunId = await app.inject({
      method: "POST",
      url: "/v1/providers/provider-alpha/submit",
      payload: {
        raidId: spawn.raidId,
        providerRunId: "run-wrong",
        answerText: "Main risk is stale provider state.",
        explanation: "The memo points to stale routing state as the main system risk.",
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(wrongRunId.statusCode, 409);
    assert.equal(wrongRunId.json().error, "provider_run_mismatch");
  } finally {
    await app.close();
  }
});

test("provider callbacks accept custom bearer header names", async () => {
  const provider = {
    profile: createProviderProfile("provider-custom-auth", {
      auth: {
        type: "bearer",
        token: "secret-custom-header",
        headerName: "x-provider-token",
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-custom",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator([provider], {
    inviteAcceptMs: 1_000,
    firstHeartbeatMs: 1_000,
    hardExecutionMs: 1_000,
    raidAbsoluteMs: 1_000,
  }, undefined, undefined, async (profile) => readyHealth(profile.providerId));

  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Summarize the memo",
    taskDescription: "Review the memo and summarize the main risks.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text"],
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
  });

  await waitFor(() =>
    orchestrator.getRaid(spawn.raidId)?.assignments["provider-custom-auth"]?.providerRunId === "run-custom",
  );

  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/providers/provider-custom-auth/submit",
      headers: {
        "x-provider-token": "Bearer secret-custom-header",
      },
      payload: {
        raidId: spawn.raidId,
        providerRunId: "run-custom",
        answerText: "Main risk is stale provider state.",
        explanation: "The memo points to stale routing state as the main system risk.",
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "final");
  } finally {
    await app.close();
  }
});

test("provider submissions accept larger artifact callbacks than the public API body limit", async () => {
  const provider = {
    profile: createProviderProfile("provider-large-submit", {
      outputTypes: ["text", "bundle"],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-large-submit",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 1_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );

  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Summarize the memo",
    taskDescription: "Review the memo and summarize the main risks.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text", "bundle"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text", "bundle"],
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
  });

  await waitFor(() =>
    orchestrator.getRaid(spawn.raidId)?.assignments["provider-large-submit"]?.providerRunId === "run-large-submit",
  );

  const app = buildApiServer(orchestrator, {
    BOSSRAID_API_BODY_LIMIT_BYTES: "512",
  });

  try {
    const largePayload = Buffer.from("x".repeat(4_096), "utf8").toString("base64");
    const response = await app.inject({
      method: "POST",
      url: "/v1/providers/provider-large-submit/submit",
      payload: {
        raidId: spawn.raidId,
        providerRunId: "run-large-submit",
        answerText: "Main risk is stale provider state.",
        explanation: "The memo points to stale routing state as the main system risk.",
        confidence: 0.8,
        filesTouched: [],
        artifacts: [
          {
            outputType: "bundle",
            label: "Large inline bundle",
            uri: `data:application/json;base64,${largePayload}`,
            mimeType: "application/json",
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "final");
  } finally {
    await app.close();
  }
});

test("registry write routes require the configured registry token", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_REGISTRY_TOKEN: "registry-secret",
  });

  try {
    const unauthorized = await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: {
        agentId: "secure-review-01",
        name: "Secure Review",
        endpoint: "http://127.0.0.1:9010",
      },
    });

    assert.equal(unauthorized.statusCode, 401);

    const authorized = await app.inject({
      method: "POST",
      url: "/agents/register",
      headers: {
        authorization: "Bearer registry-secret",
      },
      payload: {
        agentId: "secure-review-01",
        name: "Secure Review",
        endpoint: "http://127.0.0.1:9010",
      },
    });

    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.json().providerId, "secure-review-01");
  } finally {
    await app.close();
  }
});

test("public provider routes strip auth material and private diagnostics", async () => {
  const provider = {
    profile: createProviderProfile("provider-public", {
      auth: {
        type: "bearer",
        token: "super-secret-provider-token",
      },
      erc8004: {
        agentId: "agent-provider-public",
        operatorWallet: "0x0000000000000000000000000000000000000011",
        registrationTx: "0xregpublic",
        identityRegistry: "0x0000000000000000000000000000000000000022",
        reputationRegistry: "0x0000000000000000000000000000000000000033",
        validationRegistry: "0x0000000000000000000000000000000000000044",
        validationTxs: ["0xvalpublic"],
      },
      trust: {
        score: 88,
        reason: "registered provider with validation proofs",
        source: "erc8004",
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-public",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => ({
      providerId: profile.providerId,
      providerName: profile.displayName,
      endpoint: profile.endpoint,
      reachable: true,
      ready: false,
      missing: ["BOSSRAID_MODEL_API_KEY"],
      model: "gpt-test",
      modelApiBase: "https://example.invalid/v1",
      error: "missing model key",
    }),
  );
  const app = buildApiServer(orchestrator);

  try {
    const providersResponse = await app.inject({
      method: "GET",
      url: "/v1/providers",
    });

    assert.equal(providersResponse.statusCode, 200);
    const [listedProvider] = providersResponse.json() as Array<Record<string, unknown>>;
    assert.equal(listedProvider?.providerId, "provider-public");
    assert.equal(listedProvider?.endpoint, undefined);
    assert.equal(listedProvider?.auth, undefined);
    assert.equal((listedProvider?.scores as { reputationScore?: number } | undefined)?.reputationScore, 92);
    assert.equal((listedProvider?.erc8004 as { agentId?: string } | undefined)?.agentId, "agent-provider-public");
    assert.equal((listedProvider?.trust as { score?: number } | undefined)?.score, 88);

    const healthResponse = await app.inject({
      method: "GET",
      url: "/v1/providers/health",
    });

    assert.equal(healthResponse.statusCode, 200);
    const [listedHealth] = healthResponse.json() as Array<Record<string, unknown>>;
    assert.equal(listedHealth?.providerId, "provider-public");
    assert.equal(listedHealth?.providerName, "provider-public");
    assert.equal(listedHealth?.endpoint, undefined);
    assert.equal(listedHealth?.missing, undefined);
    assert.equal(listedHealth?.modelApiBase, undefined);
    assert.equal(listedHealth?.error, undefined);
  } finally {
    await app.close();
  }
});

test("admin control routes require the configured admin token", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
  });

  try {
    const raidsUnauthorized = await app.inject({
      method: "GET",
      url: "/v1/raids",
    });
    assert.equal(raidsUnauthorized.statusCode, 401);

    const raidsAuthorized = await app.inject({
      method: "GET",
      url: "/v1/raids",
      headers: {
        authorization: "Bearer admin-secret",
      },
    });
    assert.equal(raidsAuthorized.statusCode, 200);
    assert.deepEqual(raidsAuthorized.json(), []);

    const abortUnauthorized = await app.inject({
      method: "POST",
      url: "/v1/raid/raid_missing/abort",
    });
    assert.equal(abortUnauthorized.statusCode, 401);

    const abortAuthorized = await app.inject({
      method: "POST",
      url: "/v1/raid/raid_missing/abort",
      headers: {
        authorization: "Bearer admin-secret",
      },
    });
    assert.equal(abortAuthorized.statusCode, 404);

    const replayUnauthorized = await app.inject({
      method: "POST",
      url: "/v1/evaluations/raid_missing/replay",
    });
    assert.equal(replayUnauthorized.statusCode, 401);

    const replayAuthorized = await app.inject({
      method: "POST",
      url: "/v1/evaluations/raid_missing/replay",
      headers: {
        authorization: "Bearer admin-secret",
      },
    });
    assert.equal(replayAuthorized.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("admin runtime route reports deploy posture without exposing secrets", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
    BOSSRAID_DEPLOY_TARGET: "phala-cvm",
    BOSSRAID_TEE_PLATFORM: "phala",
    BOSSRAID_TEE_SOCKET_PATH: process.cwd(),
    BOSSRAID_EVAL_RUNTIME_EXECUTION: "true",
    NODE_ENV: "production",
  });

  try {
    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/runtime",
    });
    assert.equal(unauthorized.statusCode, 401);

    const authorized = await app.inject({
      method: "GET",
      url: "/v1/runtime",
      headers: {
        authorization: "Bearer admin-secret",
      },
    });

    assert.equal(authorized.statusCode, 200);
    assert.deepEqual(authorized.json(), {
      deploymentTarget: "phala-cvm",
      nodeEnv: "production",
      storageBackend: "sqlite",
      trustProxy: false,
      bodyLimitBytes: 524288,
      providerHealthTimeoutMs: 5000,
      publicRateLimit: {
        max: 60,
        windowMs: 60000,
      },
      opsSession: {
        ttlSec: 43200,
        rateLimitMax: 10,
        rateLimitWindowMs: 300000,
      },
      evaluator: {
        runtimeExecutionRequested: true,
        runtimeExecutionEnabled: false,
        transport: "disabled",
        sandboxMode: "host",
        workerIsolation: "per_job_process",
        jobTimeoutMs: 45000,
        jobContainerImageConfigured: false,
        dockerSocketConfigured: false,
        sandboxUrlConfigured: false,
        sandboxSocketConfigured: false,
        sandboxTokenConfigured: false,
        unsafeHostExecutionAllowed: false,
      },
      tee: {
        platform: "phala",
        socketPath: process.cwd(),
        appWalletConfigured: false,
        appWalletAddress: null,
        appWalletError: null,
        pathExists: true,
        socketMounted: false,
      },
    });
  } finally {
    await app.close();
  }
});

test("admin evaluator smoke route requires admin auth", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
    BOSSRAID_EVAL_RUNTIME_EXECUTION: "true",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime/evaluator-smoke",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "unauthorized",
    });
  } finally {
    await app.close();
  }
});

test("admin evaluator smoke route returns 503 when runtime execution is disabled", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
    BOSSRAID_EVAL_RUNTIME_EXECUTION: "false",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime/evaluator-smoke",
      headers: {
        authorization: "Bearer admin-secret",
      },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "runtime_execution_disabled",
      message: "Runtime execution must be enabled before evaluator smoke checks can run.",
      evaluator: {
        transport: "disabled",
        workerIsolation: "per_job_process",
      },
    });
  } finally {
    await app.close();
  }
});

test("attested runtime route returns 503 when no TEE mnemonic is configured", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_DEPLOY_TARGET: "eigencompute",
    BOSSRAID_TEE_PLATFORM: "eigencompute",
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/attested-runtime",
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "tee_signer_not_configured",
      message: "MNEMONIC environment variable is required for attested runtime proofs.",
    });
  } finally {
    await app.close();
  }
});

test("attested runtime route signs runtime state with the TEE wallet", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_DEPLOY_TARGET: "eigencompute",
    BOSSRAID_TEE_PLATFORM: "eigencompute",
    BOSSRAID_EVAL_RUNTIME_EXECUTION: "true",
    BOSSRAID_EVAL_SANDBOX_MODE: "socket",
    BOSSRAID_EVAL_SANDBOX_SOCKET: "/socket/evaluator.sock",
    MNEMONIC: TEST_MNEMONIC,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/attested-runtime",
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      signer: string;
      message: string;
      messageHash: string;
      signature: `0x${string}`;
      payload: Record<string, unknown>;
    };

    const expectedSigner = mnemonicToAccount(TEST_MNEMONIC).address;
    assert.equal(body.signer, expectedSigner);
    assert.match(body.message, /^BossRaidAttestedRuntime\|version=1\|nonce=/);
    assert.match(body.messageHash, /^0x[0-9a-f]{64}$/);
    assert.equal(body.payload.deploymentTarget, "eigencompute");
    assert.equal(body.payload.teePlatform, "eigencompute");
    assert.equal(body.payload.storageBackend, "sqlite");
    assert.equal(body.payload.providers, 0);
    assert.equal(body.payload.readyProviders, 0);
    assert.equal(body.payload.raids, 0);
    assert.equal(body.payload.evaluatorTransport, "socket");
    assert.equal(body.payload.workerIsolation, "per_job_process");
    assert.equal(typeof body.payload.timestamp, "string");
    assert.equal(typeof body.payload.nonce, "string");

    const recoveredSigner = await recoverMessageAddress({
      message: body.message,
      signature: body.signature,
    });
    assert.equal(recoveredSigner, expectedSigner);
  } finally {
    await app.close();
  }
});

test("attested raid result route requires the raid token and a configured TEE signer", async () => {
  const provider = {
    profile: createProviderProfile("provider-attested-read"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-attested-read",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Summarize the memo",
    taskDescription: "Review the memo and summarize the main risks.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text"],
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
  });
  const app = buildApiServer(orchestrator, {
    BOSSRAID_DEPLOY_TARGET: "eigencompute",
    BOSSRAID_TEE_PLATFORM: "eigencompute",
  });

  try {
    const unauthorized = await app.inject({
      method: "GET",
      url: `/v1/raid/${spawn.raidId}/attested-result`,
    });
    assert.equal(unauthorized.statusCode, 401);

    const signerUnavailable = await app.inject({
      method: "GET",
      url: `/v1/raid/${spawn.raidId}/attested-result`,
      headers: {
        "x-bossraid-raid-token": spawn.raidAccessToken,
      },
    });
    assert.equal(signerUnavailable.statusCode, 503);
    assert.deepEqual(signerUnavailable.json(), {
      error: "tee_signer_not_configured",
      message: "MNEMONIC environment variable is required for attested raid result proofs.",
    });
  } finally {
    await app.close();
  }
});

test("attested raid result route signs the raid result with the TEE wallet", async () => {
  const provider = {
    profile: createProviderProfile("provider-attested-result"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-attested-result",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: "Summarize the memo",
    taskDescription: "Review the memo and summarize the main risks.",
    language: "text",
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text"],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ["analysis"],
      minReputation: 0,
      allowedOutputTypes: ["text"],
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
  });
  const app = buildApiServer(orchestrator, {
    BOSSRAID_DEPLOY_TARGET: "eigencompute",
    BOSSRAID_TEE_PLATFORM: "eigencompute",
    BOSSRAID_EVAL_RUNTIME_EXECUTION: "true",
    BOSSRAID_EVAL_SANDBOX_MODE: "socket",
    BOSSRAID_EVAL_SANDBOX_SOCKET: "/socket/evaluator.sock",
    MNEMONIC: TEST_MNEMONIC,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: `/v1/raid/${spawn.raidId}/attested-result`,
      headers: {
        "x-bossraid-raid-token": spawn.raidAccessToken,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      signer: string;
      message: string;
      messageHash: string;
      signature: `0x${string}`;
      payload: {
        deploymentTarget: string;
        teePlatform: string;
        evaluatorTransport: string;
        workerIsolation: string;
        raidId: string;
        status: string;
        approvedSubmissionCount: number;
        resultHash: `0x${string}`;
        result: {
          raidId: string;
          status: string;
          approvedSubmissions?: unknown[];
        };
        timestamp: string;
        nonce: string;
      };
    };

    const expectedSigner = mnemonicToAccount(TEST_MNEMONIC).address;
    assert.equal(body.signer, expectedSigner);
    assert.match(body.message, /^BossRaidAttestedResult\|version=1\|nonce=/);
    assert.equal(body.messageHash, hashText(body.message));
    assert.equal(body.payload.deploymentTarget, "eigencompute");
    assert.equal(body.payload.teePlatform, "eigencompute");
    assert.equal(body.payload.evaluatorTransport, "socket");
    assert.equal(body.payload.workerIsolation, "per_job_process");
    assert.equal(body.payload.raidId, spawn.raidId);
    assert.equal(body.payload.result.raidId, spawn.raidId);
    assert.equal(body.payload.status, body.payload.result.status);
    assert.equal(body.payload.resultHash, hashText(stableStringify(body.payload.result)));
    assert.equal(body.payload.approvedSubmissionCount, body.payload.result.approvedSubmissions?.length ?? 0);
    assert.equal(typeof body.payload.timestamp, "string");
    assert.equal(typeof body.payload.nonce, "string");

    const recoveredSigner = await recoverMessageAddress({
      message: body.message,
      signature: body.signature,
    });
    assert.equal(recoveredSigner, expectedSigner);
  } finally {
    await app.close();
  }
});

test("ops session can authenticate internal control routes without a browser-shipped bearer", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
  });

  try {
    const sessionLogin = await app.inject({
      method: "POST",
      url: "/v1/ops/session",
      payload: {
        token: "admin-secret",
      },
    });

    assert.equal(sessionLogin.statusCode, 200);
    const setCookie = sessionLogin.headers["set-cookie"];
    assert.equal(typeof setCookie, "string");
    assert.match(String(setCookie), /HttpOnly/);
    assert.match(String(setCookie), /SameSite=Strict/);
    assert.match(String(setCookie), /Path=\/ops-api/);

    const cookie = String(setCookie).split(";")[0];

    const sessionStatus = await app.inject({
      method: "GET",
      url: "/v1/ops/session",
      headers: {
        cookie,
      },
    });

    assert.equal(sessionStatus.statusCode, 200);
    assert.equal(sessionStatus.json().authenticated, true);

    const raidsAuthorized = await app.inject({
      method: "GET",
      url: "/v1/raids",
      headers: {
        cookie,
      },
    });

    assert.equal(raidsAuthorized.statusCode, 200);

    const sessionLogout = await app.inject({
      method: "DELETE",
      url: "/v1/ops/session",
      headers: {
        cookie,
      },
    });

    assert.equal(sessionLogout.statusCode, 200);
    assert.equal(sessionLogout.json().authenticated, false);

    const raidsAfterLogout = await app.inject({
      method: "GET",
      url: "/v1/raids",
      headers: {
        cookie,
      },
    });

    assert.equal(raidsAfterLogout.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("ops session login is rate limited", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: "admin-secret",
    BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX: "1",
    BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS: "60000",
  });

  try {
    const firstAttempt = await app.inject({
      method: "POST",
      url: "/v1/ops/session",
      payload: {
        token: "wrong-secret",
      },
    });
    assert.equal(firstAttempt.statusCode, 401);

    const secondAttempt = await app.inject({
      method: "POST",
      url: "/v1/ops/session",
      payload: {
        token: "wrong-secret",
      },
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, "rate_limited");
    assert.equal(secondAttempt.headers["retry-after"], "60");
  } finally {
    await app.close();
  }
});

test("admin control routes return 503 until admin auth is configured", async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/raids",
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "admin_auth_not_configured",
      message: "BOSSRAID_ADMIN_TOKEN is required for this route.",
    });
  } finally {
    await app.close();
  }
});

test("public raid spawn is rate limited before orchestration work runs", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_PUBLIC_RATE_LIMIT_MAX: "1",
    BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: "60000",
  });

  try {
    const firstAttempt = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: createRaidRequestBody(),
    });
    assert.equal(firstAttempt.statusCode, 409);

    const secondAttempt = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: createRaidRequestBody(),
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, "rate_limited");
    assert.equal(secondAttempt.headers["retry-after"], "60");
  } finally {
    await app.close();
  }
});

test("public rate limiting ignores spoofed forwarded headers unless trustProxy is enabled", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_PUBLIC_RATE_LIMIT_MAX: "1",
    BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: "60000",
  });

  try {
    const firstAttempt = await app.inject({
      method: "POST",
      url: "/v1/raid",
      headers: {
        "x-forwarded-for": "198.51.100.10",
      },
      payload: createRaidRequestBody(),
    });
    assert.equal(firstAttempt.statusCode, 409);

    const secondAttempt = await app.inject({
      method: "POST",
      url: "/v1/raid",
      headers: {
        "x-forwarded-for": "203.0.113.25",
      },
      payload: createRaidRequestBody(),
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, "rate_limited");
  } finally {
    await app.close();
  }
});

test("discover only returns providers that pass live readiness checks", async () => {
  const healthyProvider = {
    profile: createProviderProfile("provider-healthy"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-healthy",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };
  const coldProvider = {
    profile: createProviderProfile("provider-cold"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-cold",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [healthyProvider, coldProvider],
    {},
    undefined,
    undefined,
    async (profile) =>
      profile.providerId === "provider-healthy"
        ? readyHealth(profile.providerId)
        : {
            providerId: profile.providerId,
            endpoint: profile.endpoint,
            reachable: true,
            ready: false,
            missing: ["BOSSRAID_MODEL"],
          },
  );
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: "GET",
      url: "/agents/discover",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().map((provider: { providerId: string }) => provider.providerId),
      ["provider-healthy"],
    );
  } finally {
    await app.close();
  }
});

test("x402 returns a payment challenge before paid routes execute", async () => {
  const provider = {
    profile: createProviderProfile("provider-paid"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-paid",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    {
      BOSSRAID_X402_ENABLED: "true",
      BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
      BOSSRAID_X402_PAY_TO: "0xabc",
    },
  );

  try {
    const unpaid = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(unpaid.statusCode, 402);
    const paymentRequiredHeader = unpaid.headers["payment-required"];
    const reservationHeader = unpaid.headers["x-bossraid-launch-reservation"];
    assert.equal(typeof paymentRequiredHeader, "string");
    assert.equal(typeof reservationHeader, "string");
    const paymentRequired = JSON.parse(Buffer.from(String(paymentRequiredHeader), "base64").toString("utf8")) as {
      accepts: Array<Record<string, unknown>>;
    };
    assert.equal(Array.isArray(paymentRequired.accepts), true);
    assert.equal(paymentRequired.accepts[0]?.asset, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    assert.deepEqual(paymentRequired.accepts[0]?.extra, {
      name: "USDC",
      version: "2",
      reservationId: reservationHeader,
    });
    assert.equal(paymentRequired.accepts[0]?.maxAmountRequired, "10010000");
    assert.equal(paymentRequired.accepts[0]?.price, "$10.01");

    const signature = createHmac("sha256", "local-x402-secret")
      .update(JSON.stringify(paymentRequired.accepts[0]))
      .digest("hex");

    const paid = await app.inject({
      method: "POST",
      url: "/v1/raid",
      headers: {
        "x-bossraid-launch-reservation": String(reservationHeader),
        "payment-signature": encodeBase64Json({
          requirement: paymentRequired.accepts[0],
          signature,
          payer: "test-buyer",
        }),
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(paid.statusCode, 200);
    assert.equal(typeof paid.headers["payment-response"], "string");
  } finally {
    await app.close();
  }
});

test("demo raid route can stay free while native raid stays paid", async () => {
  const providers = ["provider-demo-free-a", "provider-demo-free-b"].map((providerId) => ({
    profile: createProviderProfile(providerId),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: `run-${providerId}`,
      };
    },
    async run(): Promise<void> {
      return;
    },
  }));
  const env = {
    BOSSRAID_DEMO_ROUTE_ENABLED: "true",
    BOSSRAID_X402_ENABLED: "true",
    BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
    BOSSRAID_X402_PAY_TO: "0xabc",
  };

  const demoApp = buildApiServer(
    new BossRaidOrchestrator(providers, {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    env,
  );
  const paidApp = buildApiServer(
    new BossRaidOrchestrator(providers, {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    env,
  );

  try {
    const demoResponse = await demoApp.inject({
      method: "POST",
      url: "/v1/demo/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(demoResponse.statusCode, 200);
    assert.equal(demoResponse.headers["payment-required"], undefined);

    const paidResponse = await paidApp.inject({
      method: "POST",
      url: "/v1/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(paidResponse.statusCode, 402);
  } finally {
    await demoApp.close();
    await paidApp.close();
  }
});

test("demo raid route returns 404 when disabled", async () => {
  const provider = {
    profile: createProviderProfile("provider-demo-disabled"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-demo-disabled",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    {
      BOSSRAID_X402_ENABLED: "true",
      BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
    },
  );

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/demo/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: "not_found",
      message: "Demo raid route is not enabled.",
    });
  } finally {
    await app.close();
  }
});

test("demo raid route can require a dedicated demo token", async () => {
  const provider = {
    profile: createProviderProfile("provider-demo-token"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-demo-token",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    {
      BOSSRAID_DEMO_ROUTE_ENABLED: "true",
      BOSSRAID_DEMO_TOKEN: "demo-secret",
      BOSSRAID_X402_ENABLED: "true",
      BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
    },
  );

  try {
    const unauthorized = await app.inject({
      method: "POST",
      url: "/v1/demo/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(unauthorized.statusCode, 401);
    assert.deepEqual(unauthorized.json(), {
      error: "unauthorized",
      message: "Demo raid route requires a valid x-bossraid-demo-token header.",
    });

    const authorized = await app.inject({
      method: "POST",
      url: "/v1/demo/raid",
      headers: {
        "x-bossraid-demo-token": "demo-secret",
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.headers["payment-required"], undefined);
  } finally {
    await app.close();
  }
});

test("x402 reservations hold provider capacity until payment completes", async () => {
  const provider = {
    profile: createProviderProfile("provider-reserved"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-reserved",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    {
      BOSSRAID_X402_ENABLED: "true",
      BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
      BOSSRAID_X402_PAY_TO: "0xabc",
    },
  );

  try {
    const unpaid = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(unpaid.statusCode, 402);
    const paymentRequired = JSON.parse(
      Buffer.from(String(unpaid.headers["payment-required"]), "base64").toString("utf8"),
    ) as {
      accepts: Array<Record<string, unknown>>;
    };
    const reservationId = String(unpaid.headers["x-bossraid-launch-reservation"]);

    const secondRequest = createRaidRequestBody();
    secondRequest.task.title = "Fix a second button bug";
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: secondRequest,
    });

    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.headers["payment-required"], undefined);

    const signature = createHmac("sha256", "local-x402-secret")
      .update(JSON.stringify(paymentRequired.accepts[0]))
      .digest("hex");

    const paid = await app.inject({
      method: "POST",
      url: "/v1/raid",
      headers: {
        "x-bossraid-launch-reservation": reservationId,
        "payment-signature": encodeBase64Json({
          requirement: paymentRequired.accepts[0],
          signature,
          payer: "test-buyer",
        }),
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(paid.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("paid x402 requests require the launch reservation header or equivalent payment context", async () => {
  const provider = {
    profile: createProviderProfile("provider-paid-header"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-paid-header",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    {
      BOSSRAID_X402_ENABLED: "true",
      BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
      BOSSRAID_X402_PAY_TO: "0xabc",
    },
  );

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/raid",
      headers: {
        "payment-signature": encodeBase64Json({
          proof: "paid-without-reservation-context",
        }),
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "bad_request",
      message: "Paid requests must include X-BossRaid-Launch-Reservation from the payment challenge.",
    });
  } finally {
    await app.close();
  }
});

test("x402 preflight still returns 409 when no providers are eligible", async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_X402_ENABLED: "true",
    BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/raid",
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.headers["payment-required"], undefined);
  } finally {
    await app.close();
  }
});

test("x402 legacy spawn route charges against the requested budget", async () => {
  const provider = {
    profile: createProviderProfile("provider-legacy-paid"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-legacy-paid",
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) => readyHealth(profile.providerId)),
    {
      BOSSRAID_X402_ENABLED: "true",
      BOSSRAID_X402_VERIFY_HMAC_SECRET: "local-x402-secret",
      BOSSRAID_X402_PAY_TO: "0xabc",
    },
  );

  try {
    const unpaid = await app.inject({
      method: "POST",
      url: "/v1/raids",
      payload: createSpawnInputBody(),
    });

    assert.equal(unpaid.statusCode, 402);
    const paymentRequiredHeader = unpaid.headers["payment-required"];
    assert.equal(typeof paymentRequiredHeader, "string");
    const paymentRequired = JSON.parse(Buffer.from(String(paymentRequiredHeader), "base64").toString("utf8")) as {
      accepts: Array<Record<string, unknown>>;
    };
    assert.equal(paymentRequired.accepts[0]?.maxAmountRequired, "10010000");
    assert.equal(paymentRequired.accepts[0]?.price, "$10.01");
  } finally {
    await app.close();
  }
});
