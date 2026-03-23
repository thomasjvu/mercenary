import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadLocalEnv } from "../../../scripts/env.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const rootDir = resolve(packageDir, "../..");
loadLocalEnv(rootDir);

const args = parseArgs(process.argv.slice(2));
if (args.has("help")) {
  console.log([
    "Usage:",
    "  pnpm test:mcp:e2e",
    "",
    "Options:",
    "  --api-base <url>",
    "  --timeout-sec <seconds>",
  ].join("\n"));
  process.exit(0);
}

const apiBase =
  readStringArg(args, "api-base") ??
  process.env.BOSSRAID_API_BASE ??
  process.env.BOSSRAID_X402_E2E_API_BASE ??
  process.env.VITE_BOSSRAID_API_BASE ??
  "http://127.0.0.1:8787";
const timeoutSec = readNumberArg(args, "timeout-sec") ?? 35;

const transport = new StdioClientTransport({
  command: resolveServerCommand(),
  args: resolveServerArgs(),
  cwd: packageDir,
  env: {
    ...process.env,
    BOSSRAID_API_BASE: apiBase,
  },
  stderr: "pipe",
});

let stderrBuffer = "";
transport.stderr?.on("data", (chunk) => {
  stderrBuffer += chunk.toString();
});

const client = new Client(
  {
    name: "bossraid-mcp-e2e",
    version: "0.1.0",
  },
  {
    capabilities: {},
  },
);

let raidId;
let finalReceipt;

try {
  console.log(JSON.stringify({ step: "connect", apiBase }, null, 2));
  await client.connect(transport);

  const listedTools = await client.listTools();
  const toolNames = listedTools.tools.map((tool) => tool.name);
  assert(toolNames.includes("bossraid_delegate"), "MCP server did not expose bossraid_delegate.");
  assert(toolNames.includes("bossraid_receipt"), "MCP server did not expose bossraid_receipt.");
  console.log(JSON.stringify({ step: "tools", toolNames }, null, 2));

  const delegateResult = await callJsonTool(client, "bossraid_delegate", {
    prompt: "Inspect the attached file and explain the most likely bug in one sentence.",
    language: "typescript",
    files: [
      {
        path: "src/math.ts",
        content: "export function add(a: number, b: number) { return a - b; }\n",
      },
    ],
    failingSignals: {
      errors: [],
      expectedBehavior: "add(2, 3) should return 5.",
      observedBehavior: "add(2, 3) currently returns -1.",
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text", "json"],
    },
    raidPolicy: {
      maxAgents: 2,
      maxTotalCost: 2,
      privacyMode: "prefer",
      allowedOutputTypes: ["text", "json"],
    },
    waitForResult: false,
    hostContext: {
      host: "codex",
      repoRootHint: rootDir,
    },
  });

  raidId = delegateResult.raidId;
  assert.equal(typeof raidId, "string");
  assert(raidId.length > 0, "bossraid_delegate did not return a raidId.");
  console.log(JSON.stringify({ step: "delegate", raidId, delegateResult }, null, 2));

  finalReceipt = await pollForReceipt(client, raidId, timeoutSec * 1_000);
  assert(finalReceipt.synthesizedOutput, "Raid completed without a synthesizedOutput.");
  assert(
    typeof finalReceipt.synthesizedOutput.answerText === "string" ||
      typeof finalReceipt.synthesizedOutput.explanation === "string",
    "Synthesized output did not include answerText or explanation.",
  );
  assert(Array.isArray(finalReceipt.rankedSubmissions), "Receipt did not include rankedSubmissions.");
  assert(finalReceipt.rankedSubmissions.length > 0, "Receipt rankedSubmissions was empty.");

  console.log(
    JSON.stringify(
      {
        step: "success",
        raidId,
        status: finalReceipt.status,
        baseProvider: finalReceipt.synthesizedOutput.baseSubmissionProviderId,
        rankedSubmissions: finalReceipt.rankedSubmissions.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const details =
    error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
        }
      : { error: String(error) };
  console.error(
    JSON.stringify(
      {
        step: "failure",
        raidId,
        receipt: finalReceipt,
        stderr: stderrBuffer.trim() || undefined,
        ...details,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  if (raidId && (!finalReceipt || !TERMINAL_RAID_STATUSES.has(finalReceipt.status))) {
    try {
      await callJsonTool(client, "bossraid_abort", { raid_id: raidId });
    } catch {
      // Best effort cleanup only.
    }
  }

  try {
    await transport.close();
  } catch {
    // Best effort shutdown only.
  }
}

async function pollForReceipt(client, raidId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let receipt;

  while (Date.now() < deadline) {
    receipt = await callJsonTool(client, "bossraid_receipt", { raid_id: raidId });
    console.log(
      JSON.stringify(
        {
          step: "receipt",
          raidId,
          status: receipt.status,
          bestCurrentScore: receipt.bestCurrentScore,
          primaryProvider: receipt.primaryResponse?.providerId,
        },
        null,
        2,
      ),
    );

    if (receipt.primaryResponse || TERMINAL_RAID_STATUSES.has(receipt.status)) {
      return receipt;
    }

    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for raid receipt for ${raidId}.`);
}

async function callJsonTool(client, name, args) {
  const result = await client.callTool({
    name,
    arguments: args,
  });
  const text = result.content.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error(`Tool ${name} did not return a text payload.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function resolveServerCommand() {
  const builtEntry = resolve(packageDir, "dist/index.js");
  if (existsSync(builtEntry)) {
    return process.execPath;
  }

  const tsxBinary = resolve(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (existsSync(tsxBinary)) {
    return tsxBinary;
  }

  return process.execPath;
}

function resolveServerArgs() {
  const builtEntry = resolve(packageDir, "dist/index.js");
  if (existsSync(builtEntry)) {
    return [builtEntry];
  }

  const tsxBinary = resolve(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (existsSync(tsxBinary)) {
    return [resolve(packageDir, "src/index.ts")];
  }

  return ["--import", "tsx", resolve(packageDir, "src/index.ts")];
}

function parseArgs(argv) {
  const options = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options.set(key, "true");
      continue;
    }

    options.set(key, next);
    index += 1;
  }

  return options;
}

function readStringArg(options, key) {
  const value = options.get(key);
  return value && value !== "true" ? value : undefined;
}

function readNumberArg(options, key) {
  const value = readStringArg(options, key);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected positive number for --${key}.`);
  }

  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL_RAID_STATUSES = new Set(["final", "cancelled", "expired"]);
