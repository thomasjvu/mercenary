import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SqliteBossRaidPersistence } from "@bossraid/persistence-sqlite";
import type { RaidProvider } from "@bossraid/provider-sdk";
import type {
  BossRaidSpawnInput,
  OutputType,
  ProviderAcceptance,
  ProviderHealthStatus,
  ProviderHeartbeat,
  ProviderProfile,
  ProviderSubmission,
  ProviderTaskPackage,
  RaidRecord,
  RankedSubmission,
  SettlementExecutionRecord,
} from "@bossraid/shared-types";
import { computeRewards, sanitizeTask, selectProviders } from "@bossraid/raid-core";
import { BossRaidOrchestrator, NoEligibleProvidersError } from "./index.js";
import { buildHierarchicalRaidGraph } from "./hierarchy.js";

function createSpawnInput(): BossRaidSpawnInput {
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
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: [],
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

function createGameSpawnInput(): BossRaidSpawnInput {
  return {
    taskTitle: "Build a tiny GB Studio boss intro and launch package",
    taskDescription: "Create a playable GB Studio intro, define the pixel-art pack, and prepare the trailer package for the game reveal.",
    language: "typescript",
    framework: "gb-studio",
    files: [
      {
        path: "game/project.gbsproj",
        content: JSON.stringify({
          scenes: ["ArenaIntro"],
          actors: ["Boss", "Hero"],
        }),
        sha256: "test-gb-studio-file-hash",
      },
    ],
    failingSignals: {
      errors: [],
      expectedBehavior: "Return a playable GB Studio patch plus matching pixel-art and trailer guidance.",
      reproSteps: ["Open the project", "Add the boss intro", "Package the art and promo support"],
    },
    output: {
      primaryType: "patch",
      artifactTypes: ["patch", "text"],
    },
    constraints: {
      numExperts: 3,
      maxBudgetUsd: 12,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: [],
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
    displayName: "Test Provider",
    endpointType: "http",
    endpoint: "http://127.0.0.1:9999",
    specializations: ["react", "debugging"],
    supportedLanguages: ["typescript"],
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
      p50LatencyMs: 1_000,
      p95LatencyMs: 2_000,
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
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

function collectRaidTree(orchestrator: BossRaidOrchestrator, raidId: string): RaidRecord[] {
  const raid = orchestrator.getRaid(raidId);
  if (!raid) {
    return [];
  }

  return [
    raid,
    ...(raid.childRaidIds ?? []).flatMap((childRaidId) => collectRaidTree(orchestrator, childRaidId)),
  ];
}

test("spawnRaid fails fast when no providers are eligible", async () => {
  const orchestrator = new BossRaidOrchestrator();

  await assert.rejects(() => orchestrator.spawnRaid(createSpawnInput()), NoEligibleProvidersError);
});

test("cancelled raids ignore late provider activity", async () => {
  const acceptance = createDeferred<ProviderAcceptance>();
  let acceptStarted = false;

  const provider = {
    profile: createProviderProfile("provider-alpha"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      acceptStarted = true;
      return acceptance.promise;
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

  const spawn = await orchestrator.spawnRaid(createSpawnInput());
  await waitFor(() => acceptStarted);
  assert.equal(spawn.receiptPath, `/receipt?raidId=${spawn.raidId}&token=${spawn.raidAccessToken}`);

  const cancelled = orchestrator.abortRaid(spawn.raidId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.experts[0]?.status, "disqualified");

  acceptance.resolve({
    accepted: true,
    providerRunId: "run-late",
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  const lateHeartbeat: ProviderHeartbeat = {
    raidId: spawn.raidId,
    providerId: "provider-alpha",
    providerRunId: "run-late",
    progress: 0.8,
    message: "late heartbeat",
    timestamp: new Date().toISOString(),
  };
  const heartbeatStatus = orchestrator.recordProviderHeartbeat(spawn.raidId, "provider-alpha", lateHeartbeat);
  assert.equal(heartbeatStatus.status, "cancelled");
  assert.equal(heartbeatStatus.experts[0]?.status, "disqualified");

  const lateSubmission: ProviderSubmission = {
    raidId: spawn.raidId,
    providerId: "provider-alpha",
    patchUnifiedDiff: [
      "--- a/src/components/Form.tsx",
      "+++ b/src/components/Form.tsx",
      "@@",
      "-  const disabled = true;",
      "+  const disabled = false;",
    ].join("\n"),
    explanation: "Late submission that should be ignored after cancellation.",
    confidence: 0.9,
    filesTouched: ["src/components/Form.tsx"],
    submittedAt: new Date().toISOString(),
  };
  const result = await orchestrator.recordProviderSubmission(spawn.raidId, lateSubmission);
  assert.equal(result.status, "cancelled");
  assert.equal(result.approvedSubmissions?.length ?? 0, 0);
  assert.equal(result.primarySubmission, undefined);

  const finalStatus = orchestrator.getStatus(spawn.raidId);
  assert.equal(finalStatus.status, "cancelled");
  assert.equal(finalStatus.experts[0]?.status, "disqualified");
});

test("spawnRaid filters out providers that are reachable but not ready", async () => {
  let acceptCalls = 0;

  const provider = {
    profile: createProviderProfile("provider-alpha"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      acceptCalls += 1;
      return {
        accepted: true,
        providerRunId: "run-alpha",
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
      endpoint: profile.endpoint,
      reachable: true,
      ready: false,
      missing: ["BOSSRAID_MODEL_API_KEY"],
    }),
  );

  await assert.rejects(() => orchestrator.spawnRaid(createSpawnInput()), NoEligibleProvidersError);
  assert.equal(acceptCalls, 0);
  assert.equal(orchestrator.listProviders()[0]?.status, "degraded");
});

test("heartbeat stale timeout expires runs that stop heartbeating", async () => {
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

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      heartbeatStaleMs: 50,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 1_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );

  const spawn = await orchestrator.spawnRaid(createSpawnInput());

  await waitFor(() =>
    orchestrator.getRaid(spawn.raidId)?.assignments["provider-alpha"]?.providerRunId === "run-alpha",
  );

  orchestrator.recordProviderHeartbeat(spawn.raidId, "provider-alpha", {
    raidId: spawn.raidId,
    providerId: "provider-alpha",
    providerRunId: "run-alpha",
    progress: 0.5,
    message: "working",
    timestamp: new Date().toISOString(),
  });

  await waitFor(() =>
    orchestrator.getRaid(spawn.raidId)?.assignments["provider-alpha"]?.status === "timed_out",
  );

  const status = orchestrator.getStatus(spawn.raidId);
  assert.equal(status.experts[0]?.status, "timed_out");
  assert.match(status.experts[0]?.message ?? "", /heartbeat stale/i);
});

test("absolute raid deadline disqualifies non-responding providers and penalizes routing", async () => {
  const provider = {
    profile: createProviderProfile("provider-alpha"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-alpha",
      };
    },
    async run(): Promise<void> {
      return new Promise(() => {});
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 5_000,
      hardExecutionMs: 5_000,
      raidAbsoluteMs: 50,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );

  const spawn = await orchestrator.spawnRaid(createSpawnInput());
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

  const status = orchestrator.getStatus(spawn.raidId);
  assert.equal(status.status, "final");
  assert.equal(status.experts[0]?.status, "disqualified");
  assert.match(status.experts[0]?.message ?? "", /raid deadline reached/i);

  const providerAfter = orchestrator.listProviders()[0];
  assert.ok(providerAfter);
  assert.equal(providerAfter?.reputation.responsivenessScore, 0.85);
  assert.equal(providerAfter?.reputation.globalScore, 0.88);
});

test("selection respects the configured provider freshness window", () => {
  const task = createSpawnInput();
  const provider = {
    ...createProviderProfile("provider-alpha"),
    lastSeenAt: new Date(Date.now() - 90_000).toISOString(),
  };

  const strictSelection = selectProviders(task, [provider], 60_000);
  assert.equal(strictSelection.primaries.length, 0);

  const relaxedSelection = selectProviders(task, [provider], 120_000);
  assert.equal(relaxedSelection.primaries.length, 1);
  assert.equal(relaxedSelection.primaries[0]?.providerId, "provider-alpha");
});

test("selection requires the requested primary output type", () => {
  const task = createSpawnInput();
  const provider = {
    ...createProviderProfile("provider-alpha"),
    outputTypes: ["text" as const],
  };

  const selection = selectProviders(task, [provider], 60_000);
  assert.equal(selection.primaries.length, 0);
});

test("selection can require ERC-8004 identity and a minimum trust score", () => {
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      requireErc8004: true,
      minTrustScore: 70,
    },
  };
  const trustedProvider = {
    ...createProviderProfile("provider-trusted"),
    erc8004: {
      agentId: "8004-1",
      operatorWallet: "0xtrusted",
      registrationTx: "0xreg-trusted",
      identityRegistry: "0xidentity",
      reputationRegistry: "0xreputation",
    },
    trust: {
      score: 84,
      source: "erc8004" as const,
    },
  };
  const unregisteredProvider = createProviderProfile("provider-unregistered");

  const selection = selectProviders(task, [unregisteredProvider, trustedProvider], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, "provider-trusted");
});

test("strict privacy prefers Venice-backed providers when available", () => {
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      privacyMode: "strict" as const,
    },
  };
  const veniceProvider = createProviderProfile("provider-venice", {
    modelFamily: "venice",
    privacy: {
      noDataRetention: true,
      teeAttested: true,
    },
  });
  const standardProvider = createProviderProfile("provider-standard", {
    privacy: {
      noDataRetention: true,
      teeAttested: true,
    },
    trust: {
      score: 99,
      source: "erc8004" as const,
    },
  });

  const selection = selectProviders(task, [standardProvider, veniceProvider], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, "provider-venice");
});

test("text-first game routing prefers the best domain-fit provider by default", () => {
  const task = {
    ...createSpawnInput(),
    taskTitle: "Plan a one-room GB Studio microgame launch package",
    taskDescription: "Return a direct build summary for a playable GB Studio microgame with matching pixel-art and trailer support.",
    language: "text" as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: "Keep the answer scoped to the playable build, art pack, and trailer handoff.",
    },
    output: {
      primaryType: "text" as const,
      artifactTypes: ["text", "json"] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      allowedOutputTypes: ["text", "json"] as OutputType[],
      selectionMode: "best_match" as const,
    },
  };
  const gamma = createProviderProfile("provider-gamma", {
    specializations: ["gb-studio", "gameplay"],
    supportedLanguages: ["text"],
    supportedFrameworks: ["gb-studio"],
    outputTypes: ["text", "patch"],
  });
  const dottie = createProviderProfile("provider-dottie", {
    specializations: ["pixel-art", "sprites"],
    supportedLanguages: ["text"],
    supportedFrameworks: [],
    outputTypes: ["text", "image", "bundle"],
    privacy: {
      noDataRetention: true,
      signedOutputs: true,
    },
  });
  const riko = createProviderProfile("provider-riko", {
    specializations: ["video-marketing", "remotion"],
    supportedLanguages: ["text"],
    supportedFrameworks: [],
    outputTypes: ["text", "video", "bundle"],
  });

  const selection = selectProviders(task, [dottie, riko, gamma], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, "provider-gamma");
});

test("explicit privacy_first still preserves privacy-led ordering for text chats", () => {
  const task = {
    ...createSpawnInput(),
    taskTitle: "Plan a one-room GB Studio microgame launch package",
    taskDescription: "Return a direct build summary for a playable GB Studio microgame with matching pixel-art and trailer support.",
    language: "text" as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: "Keep the answer scoped to the playable build, art pack, and trailer handoff.",
    },
    output: {
      primaryType: "text" as const,
      artifactTypes: ["text", "json"] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      allowedOutputTypes: ["text", "json"] as OutputType[],
      selectionMode: "privacy_first" as const,
    },
  };
  const gamma = createProviderProfile("provider-gamma", {
    specializations: ["gb-studio", "gameplay"],
    supportedLanguages: ["text"],
    supportedFrameworks: ["gb-studio"],
    outputTypes: ["text", "patch"],
  });
  const dottie = createProviderProfile("provider-dottie", {
    specializations: ["pixel-art", "sprites"],
    supportedLanguages: ["text"],
    supportedFrameworks: [],
    outputTypes: ["text", "image", "bundle"],
    privacy: {
      noDataRetention: true,
      teeAttested: true,
      signedOutputs: true,
    },
  });

  const selection = selectProviders(task, [gamma, dottie], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, "provider-dottie");
});

test("provider selection respects active maxConcurrency across raids", async () => {
  const hold = new Promise<void>(() => {});
  let runCalls = 0;

  const provider = {
    profile: createProviderProfile("provider-alpha"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: `run-${Date.now()}`,
      };
    },
    async run(): Promise<void> {
      runCalls += 1;
      return hold;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [{ ...provider, profile: { ...provider.profile, maxConcurrency: 1 } }],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 10_000,
      hardExecutionMs: 100_000,
      raidAbsoluteMs: 100_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );

  await orchestrator.spawnRaid(createSpawnInput());
  await waitFor(() => runCalls === 1);

  await assert.rejects(() => orchestrator.spawnRaid(createSpawnInput()), NoEligibleProvidersError);
});

test("equal split settlement pays the full budget across successful providers only", () => {
  const ranked: RankedSubmission[] = [
    {
      submission: {
        raidId: "raid_1",
        providerId: "provider-alpha",
        explanation: "valid",
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
        answerText: "answer",
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 1,
        testScore: 1,
        heuristicScore: 1,
        correctnessRubric: 1,
        sideEffectSafety: 1,
        explanationScore: 1,
        latencyScore: 1,
        uniquenessScore: 1,
        finalScore: 1,
        valid: true,
        invalidReasons: [],
      },
      rank: 1,
    },
    {
      submission: {
        raidId: "raid_1",
        providerId: "provider-bravo",
        explanation: "valid",
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
        answerText: "answer",
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 1,
        testScore: 1,
        heuristicScore: 1,
        correctnessRubric: 1,
        sideEffectSafety: 1,
        explanationScore: 1,
        latencyScore: 1,
        uniquenessScore: 1,
        finalScore: 1,
        valid: true,
        invalidReasons: [],
      },
      rank: 2,
    },
    {
      submission: {
        raidId: "raid_1",
        providerId: "provider-charlie",
        explanation: "invalid",
        confidence: 0.4,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
        answerText: "answer",
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 0.2,
        testScore: 0.2,
        heuristicScore: 0.2,
        correctnessRubric: 0.2,
        sideEffectSafety: 0.2,
        explanationScore: 0.2,
        latencyScore: 1,
        uniquenessScore: 1,
        finalScore: 0.2,
        valid: false,
        invalidReasons: ["below_threshold"],
      },
      rank: 3,
    },
  ];

  const rewards = computeRewards(12, ranked, { splitStrategy: "equal_success_only" });
  assert.equal(rewards.successfulProviderCount, 2);
  assert.equal(rewards.payoutPerSuccessfulProvider, 6);
  assert.equal(rewards.successfulProvidersPaid, 12);
});

test("Mercenary synthesizes approved provider contributions into one canonical result", async () => {
  const input = {
    ...createSpawnInput(),
    language: "text" as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: "Explain the bug directly.",
    },
    output: {
      primaryType: "text" as const,
      artifactTypes: ["text", "json"] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 2,
      maxBudgetUsd: 10,
      requireSpecializations: [],
      allowedOutputTypes: ["text", "json"] as OutputType[],
    },
  };
  const receivedTasks: ProviderTaskPackage[] = [];

  const providerA: RaidProvider = {
    profile: createProviderProfile("provider-alpha", {
      supportedLanguages: ["text"],
      supportedFrameworks: [],
      outputTypes: ["text", "json"],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-alpha",
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: "provider-alpha",
        providerRunId: "run-alpha",
        answerText: "The add helper subtracts instead of adding.",
        explanation: "The return expression uses subtraction, which flips every sum.",
        confidence: 0.91,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const providerB: RaidProvider = {
    profile: createProviderProfile("provider-bravo", {
      supportedLanguages: ["text"],
      supportedFrameworks: [],
      outputTypes: ["text", "json"],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-bravo",
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: "provider-bravo",
        providerRunId: "run-bravo",
        answerText: "The helper returns a - b, so the output is inverted.",
        explanation: "Switch the arithmetic back to addition.",
        confidence: 0.87,
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

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

  const result = orchestrator.getResult(spawn.raidId);
  assert.equal(orchestrator.listRaids().length, 1);
  assert.equal(receivedTasks.length, 2);
  assert.notEqual(receivedTasks[0]?.raidId, spawn.raidId);
  assert.notEqual(receivedTasks[1]?.raidId, spawn.raidId);
  assert.equal(orchestrator.getRaid(receivedTasks[0]!.raidId)?.parentRaidId, spawn.raidId);
  assert.equal(orchestrator.getRaid(receivedTasks[1]!.raidId)?.parentRaidId, spawn.raidId);
  assert.equal(result.approvedSubmissions?.length, 2);
  assert.equal(result.synthesizedOutput?.mode, "multi_agent_synthesis");
  assert.equal(result.synthesizedOutput?.contributingProviderIds.length, 2);
  assert.equal(result.synthesizedOutput?.workstreams.length, 2);
  assert.match(receivedTasks[0]?.synthesis?.focus ?? "", /button state bug/i);
  assert.match(receivedTasks[0]?.synthesis?.workstreamObjective ?? "", /button state bug/i);
  assert.match(receivedTasks[1]?.synthesis?.focus ?? "", /button state bug/i);
  assert.deepEqual(
    result.synthesizedOutput?.workstreams.map((item) => item.label),
    ["Answer", "Risk"],
  );
  assert.notEqual(
    result.approvedSubmissions?.[0]?.submission.contributionRole?.label,
    result.approvedSubmissions?.[1]?.submission.contributionRole?.label,
  );
  assert.notEqual(
    result.approvedSubmissions?.[0]?.submission.contributionRole?.workstreamLabel,
    result.approvedSubmissions?.[1]?.submission.contributionRole?.workstreamLabel,
  );
  assert.doesNotMatch(result.synthesizedOutput?.answerText ?? "", /Supporting workstreams:/);
  assert.doesNotMatch(result.synthesizedOutput?.answerText ?? "", /Risk:/);
  assert.match(result.synthesizedOutput?.answerText ?? "", /subtracts instead of adding|returns a - b/);
  assert.doesNotMatch(result.synthesizedOutput?.explanation ?? "", /Supporting workstreams:/);
  assert.ok(result.synthesizedOutput?.workstreams.every((item) => (item.shortSummary?.length ?? 0) > 0));
  assert.doesNotMatch(result.synthesizedOutput?.workstreams[0]?.shortSummary ?? "", /Artifacts:/);
});

test("Mercenary can recurse into nested child raids when expert count exceeds the front layer", async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const input = {
    ...createSpawnInput(),
    language: "text" as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: "Explain the bug directly.",
    },
    output: {
      primaryType: "text" as const,
      artifactTypes: ["text", "json"] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 5,
      maxBudgetUsd: 20,
      requireSpecializations: [],
      allowedOutputTypes: ["text", "json"] as OutputType[],
    },
  };

  const providers = Array.from({ length: 5 }, (_, index): RaidProvider => {
    const providerId = `provider-depth-${index + 1}`;
    return {
      profile: createProviderProfile(providerId, {
        supportedLanguages: ["text"],
        supportedFrameworks: [],
        outputTypes: ["text", "json"],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: `run-${providerId}`,
        };
      },
      async run(
        task: ProviderTaskPackage,
        callbacks: {
          onHeartbeat: (heartbeat: ProviderHeartbeat) => Promise<void> | void;
          onSubmit: (submission: ProviderSubmission) => Promise<void> | void;
          onFailure: (error: Error) => Promise<void> | void;
        },
      ): Promise<void> {
        receivedTasks.push(task);
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId,
          providerRunId: `run-${providerId}`,
          answerText: `Contribution ${index + 1} explains the bug directly.`,
          explanation: `Contribution ${index + 1} adds enough detail for Mercenary to keep the synthesis graph stable.`,
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

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

  const nestedTaskRaid = receivedTasks
    .map((task) => orchestrator.getRaid(task.raidId))
    .find((raid) => raid?.parentRaidId && orchestrator.getRaid(raid.parentRaidId)?.parentRaidId === spawn.raidId);

  assert.equal(orchestrator.listRaids().length, 1);
  assert.equal(receivedTasks.length, 5);
  assert.ok(nestedTaskRaid);
  assert.equal(orchestrator.getResult(spawn.raidId).approvedSubmissions?.length, 5);
  assert.match(orchestrator.getResult(spawn.raidId).synthesizedOutput?.explanation ?? "", /workstreams/);
});

test("Mercenary routes game raids into gameplay, pixel art, and video marketing workstreams", async () => {
  const receivedTasks: Array<{ providerId: string; task: ProviderTaskPackage }> = [];
  const input = createGameSpawnInput();

  const providers: RaidProvider[] = [
    {
      profile: createProviderProfile("provider-gamma", {
        specializations: ["gb-studio", "gameplay"],
        supportedLanguages: ["typescript"],
        supportedFrameworks: ["gb-studio"],
        outputTypes: ["patch", "text"],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: "run-provider-gamma",
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push({ providerId: "provider-gamma", task });
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: "provider-gamma",
          providerRunId: "run-provider-gamma",
          patchUnifiedDiff: [
            "--- a/game/project.gbsproj",
            "+++ b/game/project.gbsproj",
            "@@",
            "+\"bossIntro\": true",
          ].join("\n"),
          explanation: "Adds the playable boss intro scene and hooks.",
          confidence: 0.92,
          filesTouched: ["game/project.gbsproj"],
          submittedAt: new Date().toISOString(),
        });
      },
    },
    {
      profile: createProviderProfile("provider-dottie", {
        specializations: ["pixel-art", "sprites"],
        supportedLanguages: ["text"],
        supportedFrameworks: [],
        outputTypes: ["image", "text", "bundle"],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: "run-provider-dottie",
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push({ providerId: "provider-dottie", task });
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: "provider-dottie",
          providerRunId: "run-provider-dottie",
          artifacts: [
            {
              outputType: "image",
              label: "Boss sprite sheet",
              uri: "https://example.com/art/boss-spritesheet.png",
              mimeType: "image/png",
              description: "Hero, boss, arena tiles, and UI frame in one preview sheet.",
            },
          ],
          explanation: "Defines the pixel-art handoff the builder needs.",
          confidence: 0.88,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    },
    {
      profile: createProviderProfile("provider-riko", {
        specializations: ["remotion", "motion-design"],
        supportedLanguages: ["text"],
        supportedFrameworks: [],
        outputTypes: ["video", "text"],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: "run-provider-riko",
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push({ providerId: "provider-riko", task });
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: "provider-riko",
          providerRunId: "run-provider-riko",
          artifacts: [
            {
              outputType: "video",
              label: "Boss intro trailer",
              uri: "https://example.com/video/boss-intro.mp4",
              mimeType: "video/mp4",
              description: "Title card, boss reveal, gameplay beat, and CTA.",
            },
          ],
          explanation: "Provides the trailer angle and launch copy.",
          confidence: 0.86,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    },
  ];

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

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

  const result = orchestrator.getResult(spawn.raidId);
  const childRaids = orchestrator
    .getRaid(spawn.raidId)!
    .childRaidIds!.map((childRaidId) => orchestrator.getRaid(childRaidId)!);

  assert.equal(receivedTasks.length, 3);
  assert.deepEqual(
    childRaids
      .map((raid) => ({
        workstream: raid.contributionPlan?.workstreamLabel,
        primaryType: raid.task.output?.primaryType,
        requiredSpecializations: raid.task.constraints.requireSpecializations,
      }))
      .sort((left, right) => String(left.workstream).localeCompare(String(right.workstream))),
    [
      {
        workstream: "Gameplay",
        primaryType: "patch",
        requiredSpecializations: ["gb-studio"],
      },
      {
        workstream: "Pixel Art",
        primaryType: "image",
        requiredSpecializations: ["pixel-art"],
      },
      {
        workstream: "Video Marketing",
        primaryType: "video",
        requiredSpecializations: ["remotion"],
      },
    ]
      .map((entry) => entry)
      .sort((left, right) => left.workstream.localeCompare(right.workstream)),
  );
  assert.deepEqual(
    receivedTasks
      .map(({ providerId, task }) => ({
        providerId,
        workstream: task.synthesis?.workstreamLabel,
        primaryType: task.desiredOutput.primaryType,
      }))
      .sort((left, right) => left.providerId.localeCompare(right.providerId)),
    [
      {
        providerId: "provider-dottie",
        workstream: "Pixel Art",
        primaryType: "image",
      },
      {
        providerId: "provider-gamma",
        workstream: "Gameplay",
        primaryType: "patch",
      },
      {
        providerId: "provider-riko",
        workstream: "Video Marketing",
        primaryType: "video",
      },
    ],
  );
  assert.deepEqual(
    [...(result.synthesizedOutput?.workstreams.map((item) => item.label) ?? [])].sort(),
    ["Gameplay", "Pixel Art", "Video Marketing"].sort(),
  );
  assert.deepEqual(
    result.synthesizedOutput?.workstreams
      .map((item) => ({ label: item.label, primaryType: item.primaryType }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    [
      { label: "Gameplay", primaryType: "patch" },
      { label: "Pixel Art", primaryType: "image" },
      { label: "Video Marketing", primaryType: "video" },
    ],
  );
  assert.deepEqual(
    result.synthesizedOutput?.artifacts?.map((artifact) => artifact.outputType).sort(),
    ["image", "video"],
  );
  assert.equal(result.approvedSubmissions?.length, 3);
});

test("Mercenary uses nested game-specific workstream families for larger game swarms", () => {
  const graph = buildHierarchicalRaidGraph(
    sanitizeTask({
      ...createGameSpawnInput(),
      constraints: {
        ...createGameSpawnInput().constraints,
        numExperts: 5,
        maxBudgetUsd: 20,
      },
    }),
  );

  const topLevelLabels = graph.children?.map((child) => child.contributionPlan?.workstreamLabel) ?? [];
  const gameplayNode = graph.children?.find((child) => child.contributionPlan?.workstreamLabel === "Gameplay");
  const artNode = graph.children?.find((child) => child.contributionPlan?.workstreamLabel === "Pixel Art");
  const promoNode = graph.children?.find((child) => child.contributionPlan?.workstreamLabel === "Video Marketing");

  assert.deepEqual(topLevelLabels, ["Gameplay", "Pixel Art", "Video Marketing"]);
  assert.deepEqual(gameplayNode?.task.constraints.requireSpecializations, ["gb-studio"]);
  assert.equal(gameplayNode?.task.output?.primaryType, "patch");
  assert.ok(gameplayNode?.children?.some((child) => /Gameplay Core|Gameplay QA/.test(child.contributionPlan?.workstreamLabel ?? "")));
  assert.deepEqual(artNode?.task.constraints.requireSpecializations, ["pixel-art"]);
  assert.equal(artNode?.task.output?.primaryType, "image");
  assert.deepEqual(artNode?.task.output?.artifactTypes, ["image", "text", "bundle"]);
  assert.equal(artNode?.task.language, "text");
  assert.equal(artNode?.task.framework, undefined);
  assert.ok(artNode?.children?.some((child) => /Art Direction|Asset Pack/.test(child.contributionPlan?.workstreamLabel ?? "")));
  assert.deepEqual(promoNode?.task.constraints.requireSpecializations, ["remotion"]);
  assert.equal(promoNode?.task.output?.primaryType, "video");
  assert.deepEqual(promoNode?.task.output?.artifactTypes, ["video", "text"]);
  assert.equal(promoNode?.task.language, "text");
});

test("Mercenary can revise the raid graph with an adaptive repair child raid", async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const input = {
    ...createSpawnInput(),
    language: "text" as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: "Explain the bug directly with caveats.",
    },
    output: {
      primaryType: "text" as const,
      artifactTypes: ["text", "json"] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 8,
      maxBudgetUsd: 24,
      requireSpecializations: [],
      allowedOutputTypes: ["text", "json"] as OutputType[],
    },
  };

  const providers = [
    ...Array.from({ length: 7 }, (_, index): RaidProvider => {
      const providerId = `provider-adaptive-${index + 1}`;
      return {
        profile: createProviderProfile(providerId, {
          supportedLanguages: ["text"],
          supportedFrameworks: [],
          outputTypes: ["text", "json"],
        }),
        async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
          return {
            accepted: true,
            providerRunId: `run-${providerId}`,
          };
        },
        async run(task, callbacks): Promise<void> {
          receivedTasks.push(task);
          const isRiskScope = /Risk/i.test(task.synthesis?.workstreamLabel ?? "");
          await callbacks.onSubmit({
            raidId: task.raidId,
            providerId,
            providerRunId: `run-${providerId}`,
            answerText: isRiskScope ? "short" : `Adaptive contribution ${index + 1} covers ${task.synthesis?.workstreamLabel ?? "the task"}.`,
            explanation: isRiskScope ? "too short" : `Adaptive contribution ${index + 1} adds valid coverage for ${task.synthesis?.workstreamLabel ?? "the task"}.`,
            confidence: 0.8,
            filesTouched: [],
            submittedAt: new Date().toISOString(),
          });
        },
      };
    }),
    {
      profile: createProviderProfile("provider-adaptive-repair", {
        supportedLanguages: ["text"],
        supportedFrameworks: [],
        outputTypes: ["text", "json"],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: "run-provider-adaptive-repair",
        };
      },
      async run(
        task: ProviderTaskPackage,
        callbacks: {
          onHeartbeat: (heartbeat: ProviderHeartbeat) => Promise<void>;
          onSubmit: (submission: ProviderSubmission) => Promise<void>;
          onFailure: (error: Error) => Promise<void>;
        },
      ): Promise<void> {
        receivedTasks.push(task);
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: "provider-adaptive-repair",
          providerRunId: "run-provider-adaptive-repair",
          answerText: `Repair contribution covers ${task.synthesis?.workstreamLabel ?? "the missing scope"}.`,
          explanation: "This repair child fills the missing risk coverage after the first graph underperformed.",
          confidence: 0.88,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    },
  ];

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

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

  const rootRaid = orchestrator.getRaid(spawn.raidId)!;
  const allRaids = collectRaidTree(orchestrator, spawn.raidId);
  const repairRaid = allRaids.find((raid) => raid.contributionPlan?.roleLabel === "Risk Core Repair");

  assert.ok(repairRaid);
  assert.equal(repairRaid?.deadlineUnix, rootRaid.deadlineUnix);
  assert.equal(rootRaid.adaptivePlanning?.revisionCount, 1);
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.workstreamId, "risk-core");
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.targetParentRaidId, repairRaid?.parentRaidId);
  assert.deepEqual(rootRaid.adaptivePlanning?.history[0]?.spawnedRaidIds, [repairRaid?.id]);
  assert.equal(receivedTasks.length, 8);
  assert.equal(orchestrator.getResult(spawn.raidId).approvedSubmissions?.length, 6);
});

test("Mercenary can deepen a weak workstream into an adaptive expansion subgraph", async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const input = {
    ...createSpawnInput(),
    language: "text" as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: "Explain the bug directly with risk coverage.",
    },
    output: {
      primaryType: "text" as const,
      artifactTypes: ["text", "json"] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 10,
      maxBudgetUsd: 30,
      requireSpecializations: [],
      allowedOutputTypes: ["text", "json"] as OutputType[],
    },
  };

  const providers = Array.from({ length: 10 }, (_, index): RaidProvider => {
    const providerId = `provider-adaptive-expand-${index + 1}`;
    const isAdaptiveReserve = index >= 8;

    return {
      profile: createProviderProfile(providerId, {
        supportedLanguages: ["text"],
        supportedFrameworks: [],
        outputTypes: ["text", "json"],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: `run-${providerId}`,
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push(task);
        const isRiskScope = /Risk/i.test(task.synthesis?.workstreamLabel ?? "");
        const invalidInitialRisk = isRiskScope && !isAdaptiveReserve;

        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId,
          providerRunId: `run-${providerId}`,
          answerText: invalidInitialRisk
            ? "short"
            : `${providerId} covers ${task.synthesis?.workstreamLabel ?? "the task"} with usable detail.`,
          explanation: invalidInitialRisk
            ? "too short"
            : `${providerId} contributes valid coverage for ${task.synthesis?.workstreamLabel ?? "the task"}.`,
          confidence: invalidInitialRisk ? 0.3 : 0.84,
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

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

  const rootRaid = orchestrator.getRaid(spawn.raidId)!;
  const allRaids = collectRaidTree(orchestrator, spawn.raidId);
  const expansionRaid = allRaids.find((raid) => raid.contributionPlan?.roleLabel === "Risk Core Expansion");
  const expansionChildren = expansionRaid?.childRaidIds?.map((childRaidId) => orchestrator.getRaid(childRaidId)!);
  const result = orchestrator.getResult(spawn.raidId);

  assert.ok(expansionRaid);
  assert.ok((expansionChildren?.length ?? 0) >= 2);
  assert.equal(expansionRaid?.deadlineUnix, rootRaid.deadlineUnix);
  assert.ok(expansionChildren?.every((raid) => raid.deadlineUnix === rootRaid.deadlineUnix));
  assert.equal(rootRaid.adaptivePlanning?.revisionCount, 1);
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.strategy, "expand");
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.workstreamId, "risk-core");
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.targetParentRaidId, expansionRaid?.parentRaidId);
  assert.deepEqual(rootRaid.adaptivePlanning?.history[0]?.spawnedRaidIds, [expansionRaid?.id]);
  assert.equal(result.adaptivePlanning?.history[0]?.strategy, "expand");
  assert.equal(result.adaptivePlanning?.remainingReserveExperts, 0);
  assert.equal(receivedTasks.length, 10);
  assert.ok(expansionChildren?.some((raid) => /Risk Core|Risk Counterexamples/.test(raid.contributionPlan?.workstreamLabel ?? "")));
  assert.ok(result.approvedSubmissions?.some((entry) => entry.submission.contributionRole?.workstreamId?.startsWith("risk-")));
});

test("Mercenary can recurse across multiple child-raid levels for large expert swarms", async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const expertCount = 20;
  const input = {
    ...createSpawnInput(),
    language: "text" as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: "Explain the bug directly from many expert angles.",
    },
    output: {
      primaryType: "text" as const,
      artifactTypes: ["text", "json"] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: expertCount,
      maxBudgetUsd: 80,
      requireSpecializations: [],
      allowedOutputTypes: ["text", "json"] as OutputType[],
    },
  };

  const providers = Array.from({ length: expertCount }, (_, index): RaidProvider => {
    const providerId = `provider-depth-swarm-${index + 1}`;
    return {
      profile: createProviderProfile(providerId, {
        supportedLanguages: ["text"],
        supportedFrameworks: [],
        outputTypes: ["text", "json"],
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
          answerText: `Swarm contribution ${index + 1} isolates one answer facet.`,
          explanation: `Swarm contribution ${index + 1} adds another scoped expert signal for Mercenary to synthesize.`,
          confidence: 0.78,
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

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

  const maxDepth = Math.max(
    ...receivedTasks.map((task) => {
      let depth = 0;
      let current = orchestrator.getRaid(task.raidId);
      while (current) {
        depth += 1;
        current = current.parentRaidId == null ? undefined : orchestrator.getRaid(current.parentRaidId);
      }
      return depth;
    }),
  );

  assert.ok(receivedTasks.length <= expertCount);
  assert.ok(maxDepth >= 3);
  assert.equal(orchestrator.getResult(spawn.raidId).approvedSubmissions?.length, receivedTasks.length);
});

test("sqlite persistence saves and reloads snapshot state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bossraid-sqlite-test-"));
  const persistence = new SqliteBossRaidPersistence(join(dir, "state.sqlite"));
  const snapshot = {
    version: 1 as const,
    savedAt: new Date().toISOString(),
    raids: [],
    providers: [createProviderProfile("provider-alpha")],
  };

  try {
    await persistence.saveState(snapshot);
    const loaded = await persistence.loadState();
    assert.deepEqual(loaded, snapshot);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restoreState merges persisted provider aliases into seeded providers by endpoint", () => {
  const orchestrator = new BossRaidOrchestrator([
    {
      profile: createProviderProfile("riko", {
        agentId: "riko",
        displayName: "Riko",
        endpoint: "http://provider-b:9002",
        specializations: ["video-marketing", "remotion"],
        outputTypes: ["video", "text", "bundle"],
      }),
      async accept(): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: "run-riko",
        };
      },
      async run(): Promise<void> {
        return;
      },
    },
  ]);

  const normalized = orchestrator.restoreState({
    version: 1,
    savedAt: new Date().toISOString(),
    raids: [],
    providers: [
      createProviderProfile("minimal-diff-hunter", {
        agentId: "minimal-diff-hunter",
        displayName: "Riko",
        endpoint: "http://provider-b:9002/",
        specializations: ["video-marketing", "remotion", "launch-copy"],
        outputTypes: ["video", "text", "bundle"],
        reputation: {
          globalScore: 0.77,
          responsivenessScore: 0.81,
          validityScore: 0.75,
          qualityScore: 0.8,
          timeoutRate: 0.09,
          duplicateRate: 0.03,
          specializationScores: { remotion: 0.9 },
          p50LatencyMs: 10_500,
          p95LatencyMs: 24_000,
          totalRaids: 21,
          totalSuccessfulRaids: 5,
        },
      }),
    ],
    launchReservations: [],
  });

  const providers = orchestrator.listProviders();
  assert.equal(normalized, true);
  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerId, "riko");
  assert.equal(providers[0]?.displayName, "Riko");
  assert.equal(providers[0]?.reputation.totalRaids, 21);
});

test("upsertRegisteredProvider replaces aliased providers with the canonical agent id", () => {
  const orchestrator = new BossRaidOrchestrator([
    {
      profile: createProviderProfile("minimal-diff-hunter", {
        agentId: "minimal-diff-hunter",
        displayName: "Riko",
        endpoint: "http://provider-b:9002",
        outputTypes: ["video", "text", "bundle"],
      }),
      async accept(): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: "run-riko",
        };
      },
      async run(): Promise<void> {
        return;
      },
    },
  ]);

  const provider = orchestrator.upsertRegisteredProvider({
    agentId: "riko",
    name: "Riko",
    endpoint: "http://provider-b:9002/",
    outputTypes: ["video", "text", "bundle"],
  });

  const providers = orchestrator.listProviders();
  assert.equal(provider.providerId, "riko");
  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerId, "riko");
});

test("updateSettlementExecution persists refreshed settlement proof state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bossraid-sqlite-settlement-"));
  const persistence = new SqliteBossRaidPersistence(join(dir, "state.sqlite"));
  const provider = {
    profile: createProviderProfile("provider-alpha"),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: "run-alpha",
      };
    },
    async run(
      task: ProviderTaskPackage,
      callbacks: {
        onHeartbeat: (heartbeat: ProviderHeartbeat) => void | Promise<void>;
        onSubmit: (submission: ProviderSubmission) => void | Promise<void>;
        onFailure: (error: Error) => void | Promise<void>;
      },
    ): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: "provider-alpha",
        providerRunId: "run-alpha",
        explanation: "Fixed the disabled state.",
        confidence: 0.91,
        filesTouched: ["src/components/Form.tsx"],
        patchUnifiedDiff: "--- a/src/components/Form.tsx",
        submittedAt: new Date().toISOString(),
      });
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
    persistence,
    undefined,
    async (profile) => readyHealth(profile.providerId),
  );

  try {
    const spawn = await orchestrator.spawnRaid(createSpawnInput());
    await waitFor(() => orchestrator.getStatus(spawn.raidId).status === "final");

    const settlementExecution: SettlementExecutionRecord = {
      mode: "onchain",
      proofStandard: "erc8183_aligned",
      lifecycleStatus: "partial",
      executedAt: new Date().toISOString(),
      artifactPath: join(dir, "raid_1.settlement.json"),
      registryRaidRef: "7",
      taskHash: "0xtaskhash",
      evaluationHash: "0xevaluationhash",
      successfulProviderIds: ["provider-alpha"],
      allocations: [
        {
          providerId: "provider-alpha",
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
        rpcUrl: "https://rpc.example",
      },
      registryCall: {
        method: "finalizeRaid",
        args: ["7", "0xevaluationhash"],
      },
      childJobs: [
        {
          jobRef: `${spawn.raidId}:provider-alpha`,
          providerId: "provider-alpha",
          providerAddress: "0x0000000000000000000000000000000000000106",
          role: "successful",
          status: "complete",
          requestedAction: "complete",
          lifecycleStatus: "submitted",
          budgetUsd: 10,
          budgetAtomic: "10000000",
          submitResultHash: "0xsubmissionhash",
          completionPolicy: "submit and complete child job",
          nextAction: "Evaluator completion is still required from the configured evaluator wallet.",
          jobId: "9",
        },
      ],
      warnings: ["awaiting evaluator completion"],
    };

    await orchestrator.updateSettlementExecution(spawn.raidId, settlementExecution);

    const snapshot = await persistence.loadState();
    const persistedRaid = snapshot.raids.find((raid) => raid.id === spawn.raidId);
    assert.equal(persistedRaid?.settlementExecution?.mode, "onchain");
    assert.equal(persistedRaid?.settlementExecution?.lifecycleStatus, "partial");
    assert.equal(persistedRaid?.settlementExecution?.childJobs[0]?.lifecycleStatus, "submitted");
    assert.equal(persistedRaid?.settlementExecution?.warnings?.[0], "awaiting evaluator completion");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
