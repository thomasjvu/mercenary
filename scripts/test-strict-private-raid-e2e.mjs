import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const apiPort = Number(process.env.PORT ?? String(8700 + (Date.now() % 1000)));
const apiBase = process.env.BOSSRAID_API_BASE ?? `http://127.0.0.1:${apiPort}`;
const explicitProvidersFile = process.env.BOSSRAID_PROVIDERS_FILE;
const providersFile =
  explicitProvidersFile && explicitProvidersFile !== "./examples/providers.http.json"
    ? explicitProvidersFile
    : "./examples/strict-private/providers.http.json";
const explicitSqliteFile = process.env.BOSSRAID_SQLITE_FILE;
const sqliteFile =
  explicitSqliteFile && explicitSqliteFile !== "./temp/bossraid-state.sqlite"
    ? explicitSqliteFile
    : `./temp/strict-private-e2e-${Date.now()}.sqlite`;
const env = {
  ...process.env,
  PORT: String(apiPort),
  BOSSRAID_STORAGE_BACKEND: process.env.BOSSRAID_STORAGE_BACKEND ?? "sqlite",
  BOSSRAID_SQLITE_FILE: sqliteFile,
  BOSSRAID_PROVIDERS_FILE: providersFile,
  BOSSRAID_CALLBACK_BASE: process.env.BOSSRAID_CALLBACK_BASE ?? apiBase,
  BOSSRAID_X402_ENABLED: "false",
  BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH: process.env.BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH ?? "1",
  BOSSRAID_HARD_EXECUTION_MS: process.env.BOSSRAID_HARD_EXECUTION_MS ?? "85000",
};

let providersChild;
let apiChild;
let teardownStarted = false;

process.on("SIGINT", () => void teardown());
process.on("SIGTERM", () => void teardown());

try {
  console.log(JSON.stringify({ step: "build" }, null, 2));
  await runCommand("pnpm", ["build"]);

  console.log(JSON.stringify({ step: "start_providers", providersFile: env.BOSSRAID_PROVIDERS_FILE }, null, 2));
  providersChild = spawn("node", ["scripts/run-provider-set.mjs"], {
    cwd: rootDir,
    stdio: "inherit",
    env,
  });

  console.log(JSON.stringify({ step: "start_api", apiBase }, null, 2));
  apiChild = spawn("node", ["apps/api/dist/apps/api/src/index.js"], {
    cwd: rootDir,
    stdio: "inherit",
    env,
  });

  await waitForHealth(`${apiBase}/health`);

  console.log(JSON.stringify({ step: "spawn_raid" }, null, 2));
  const spawnResponse = await fetch(new URL("/v1/raid", apiBase), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: await readFixture("./examples/strict-private-raid.json"),
  });
  if (!spawnResponse.ok) {
    throw new Error(`Spawn failed with ${spawnResponse.status}: ${await spawnResponse.text()}`);
  }

  const spawnBody = await spawnResponse.json();
  if (typeof spawnBody.raidId !== "string" || typeof spawnBody.raidAccessToken !== "string") {
    throw new Error(`Unexpected spawn response: ${JSON.stringify(spawnBody)}`);
  }

  console.log(JSON.stringify({ step: "spawned", raidId: spawnBody.raidId }, null, 2));
  const result = await waitForResult(apiBase, spawnBody.raidId, spawnBody.raidAccessToken);
  verifyResult(result);

  const agentLog = await fetchAgentLog(apiBase, spawnBody.raidId, spawnBody.raidAccessToken);
  verifyAgentLog(agentLog);

  console.log(
    JSON.stringify(
      {
        step: "verified",
        raidId: spawnBody.raidId,
        answerPreview: result.synthesizedOutput?.answerText?.slice(0, 160) ?? null,
        routingPolicy: result.routingProof?.policy,
        routedProviders: result.routingProof?.providers.map((provider) => ({
          providerId: provider.providerId,
          phase: provider.phase,
          veniceBacked: provider.veniceBacked,
          erc8004Registered: provider.erc8004Registered,
          trustScore: provider.trustScore,
          reasons: provider.reasons,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await teardown();
}

async function waitForHealth(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(url).catch(() => undefined);
    if (response?.ok) {
      const payload = await response.json();
      if (payload.readyProviders >= 3) {
        console.log(JSON.stringify({ step: "health_ready", payload }, null, 2));
        return;
      }
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for provider health at ${url}`);
}

async function waitForResult(apiBaseUrl, raidId, raidAccessToken, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const resultUrl = new URL(`/v1/raid/${encodeURIComponent(raidId)}/result`, apiBaseUrl);
  while (Date.now() < deadline) {
    const response = await fetch(resultUrl, {
      headers: {
        "x-bossraid-raid-token": raidAccessToken,
      },
    });
    if (!response.ok) {
      throw new Error(`Result poll failed with ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    if (payload.status === "final") {
      return payload;
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for final raid result for ${raidId}`);
}

async function fetchAgentLog(apiBaseUrl, raidId, raidAccessToken) {
  const response = await fetch(
    new URL(`/v1/raids/${encodeURIComponent(raidId)}/agent_log.json?token=${encodeURIComponent(raidAccessToken)}`, apiBaseUrl),
  );
  if (!response.ok) {
    throw new Error(`Agent log fetch failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function verifyResult(result) {
  if (result.status !== "final") {
    throw new Error(`Expected final raid result, received ${result.status}`);
  }
  if (result.synthesizedOutput?.primaryType !== "text") {
    throw new Error(`Expected text primary output, received ${result.synthesizedOutput?.primaryType ?? "missing"}`);
  }
  if (!result.synthesizedOutput?.answerText?.trim()) {
    throw new Error("Expected synthesized answer text.");
  }
  if (!result.routingProof) {
    throw new Error("Expected routing proof.");
  }

  verifyRoutingProof(result.routingProof);
}

function verifyAgentLog(agentLog) {
  if (agentLog.task?.constraints?.privacyMode !== "strict") {
    throw new Error(`Expected strict privacy in agent log, received ${agentLog.task?.constraints?.privacyMode ?? "missing"}`);
  }
  if (agentLog.task?.constraints?.requireErc8004 !== true) {
    throw new Error("Expected ERC-8004 requirement in agent log.");
  }
  verifyRoutingProof(agentLog.routing);
}

function verifyRoutingProof(routingProof) {
  const policy = routingProof.policy ?? {};
  if (policy.privacyMode !== "strict") {
    throw new Error(`Expected strict routing policy, received ${policy.privacyMode ?? "missing"}`);
  }
  if (policy.selectionMode !== "privacy_first") {
    throw new Error(`Expected privacy_first selection mode, received ${policy.selectionMode ?? "missing"}`);
  }
  if (policy.requireErc8004 !== true) {
    throw new Error("Expected routing proof to require ERC-8004.");
  }
  if (policy.minTrustScore !== 80) {
    throw new Error(`Expected min trust score 80, received ${policy.minTrustScore ?? "missing"}`);
  }
  if (!policy.allowedModelFamilies?.includes("venice")) {
    throw new Error(`Expected Venice-only routing, received ${JSON.stringify(policy.allowedModelFamilies ?? [])}`);
  }
  if (policy.venicePrivateLane !== true) {
    throw new Error("Expected Venice private lane to be active.");
  }

  const primaryProviders = (routingProof.providers ?? []).filter((provider) => provider.phase === "primary");
  const uniquePrimaryProviders = [...new Map(primaryProviders.map((provider) => [provider.providerId, provider])).values()];
  if (uniquePrimaryProviders.length < 2) {
    throw new Error(`Expected at least 2 unique primary providers, received ${uniquePrimaryProviders.length}`);
  }

  for (const provider of uniquePrimaryProviders) {
    if (!provider.veniceBacked) {
      throw new Error(`Expected Venice-backed provider, received ${provider.providerId}`);
    }
    if (!provider.erc8004Registered) {
      throw new Error(`Expected ERC-8004 registration for ${provider.providerId}`);
    }
    if (provider.trustScore < 80) {
      throw new Error(`Expected trust score >= 80 for ${provider.providerId}, received ${provider.trustScore}`);
    }
  }
}

async function readFixture(relativePath) {
  const { readFile } = await import("node:fs/promises");
  return readFile(resolve(rootDir, relativePath), "utf8");
}

async function teardown() {
  if (teardownStarted) {
    return;
  }
  teardownStarted = true;
  await Promise.all([stopChild(apiChild), stopChild(providersChild)]);
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      env,
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} exited via signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 0}`));
        return;
      }
      resolve(undefined);
    });
  });
}

async function stopChild(child) {
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    child.once("close", () => resolve(undefined));
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, 2_000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
