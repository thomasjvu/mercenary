import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const args = parseArgs(process.argv.slice(2));
if (args.has("help")) {
  console.log([
    "Usage:",
    "  pnpm test:evaluator:e2e",
    "  pnpm test:evaluator:e2e -- --sandbox-url http://127.0.0.1:8790",
    "  pnpm test:evaluator:e2e -- --sandbox-socket /tmp/bossraid-evaluator.sock",
    "  docker compose exec -T api node scripts/test-evaluator-e2e.mjs",
    "",
    "Options:",
    "  --sandbox-url <url>",
    "  --sandbox-socket <path>",
    "  --token <bearer-token>",
  ].join("\n"));
  process.exit(0);
}

const sandboxSocket =
  readStringArg(args, "sandbox-socket") ??
  process.env.BOSSRAID_EVAL_E2E_SOCKET ??
  process.env.BOSSRAID_EVAL_SANDBOX_SOCKET;
const sandboxUrl =
  readStringArg(args, "sandbox-url") ??
  process.env.BOSSRAID_EVAL_E2E_URL ??
  process.env.BOSSRAID_EVAL_SANDBOX_URL ??
  "http://127.0.0.1:8790";
const token =
  readStringArg(args, "token") ??
  process.env.BOSSRAID_EVAL_E2E_TOKEN ??
  process.env.BOSSRAID_EVAL_SANDBOX_TOKEN;

const healthUrl = new URL("/health", sandboxUrl);
const probeUrl = new URL("/v1/runtime-probes", sandboxUrl);

console.log(JSON.stringify({
  step: "start",
  transport: sandboxSocket ? "socket" : "http",
  sandboxUrl: sandboxSocket ? undefined : sandboxUrl,
  sandboxSocket: sandboxSocket ?? undefined,
  tokenConfigured: Boolean(token),
}, null, 2));

const healthResponse = sandboxSocket
  ? await requestOverSocket(sandboxSocket, "/health")
  : await requestOverHttp(healthUrl);
if (healthResponse.status !== 200) {
  throw new Error(`Evaluator health check failed with ${healthResponse.status}: ${JSON.stringify(healthResponse.body)}`);
}

console.log(JSON.stringify({
  step: "health",
  health: healthResponse.body,
}, null, 2));

const response = sandboxSocket
  ? await requestOverSocket(sandboxSocket, "/v1/runtime-probes", createRuntimeProbeInput(), token)
  : await requestOverHttp(probeUrl, createRuntimeProbeInput(), token);
if (response.status < 200 || response.status >= 300) {
  throw new Error(`Runtime probe request failed with ${response.status}: ${JSON.stringify(response.body)}`);
}

if (
  !response.body ||
  typeof response.body !== "object" ||
  (response.body.tests?.passed ?? 0) < 1 ||
  (response.body.tests?.failed ?? 0) !== 0
) {
  throw new Error(`Runtime probes did not report a clean passing test run: ${JSON.stringify(response.body)}`);
}

console.log(JSON.stringify({
  step: "success",
  result: response.body,
}, null, 2));

function createRuntimeProbeInput() {
  const files = [
    taskFile(
      "package.json",
      JSON.stringify(
        {
          name: "bossraid-eval-smoke",
          private: true,
          type: "module",
          scripts: {
            test: "node --test",
          },
        },
        null,
        2,
      ),
    ),
    taskFile(
      "sum.js",
      [
        "export function sum(a, b) {",
        "  return a + b;",
        "}",
      ].join("\n"),
    ),
    taskFile(
      "sum.test.js",
      [
        'import assert from "node:assert/strict";',
        'import test from "node:test";',
        'import { sum } from "./sum.js";',
        "",
        'test("sum adds positive integers", () => {',
        "  assert.equal(sum(2, 3), 5);",
        "});",
      ].join("\n"),
    ),
  ];

  return {
    task: {
      taskTitle: "Evaluator smoke test",
      taskDescription: "Confirm the isolated evaluator can execute a real Node built-in test suite.",
      language: "text",
      framework: "node",
      files,
      failingSignals: {
        errors: ["sum must return the correct arithmetic result."],
        tests: ["node --test"],
        reproSteps: ["Run node --test in the workspace."],
      },
      constraints: {
        numExperts: 1,
        maxBudgetUsd: 1,
        maxLatencySec: 30,
        allowExternalSearch: false,
        requireSpecializations: ["node"],
        minReputation: 0,
        allowedOutputTypes: ["patch", "text"],
        privacyMode: "off",
      },
      rewardPolicy: {
        splitStrategy: "equal_success_only",
      },
      privacyMode: {
        redactSecrets: false,
        redactIdentifiers: false,
        allowFullRepo: false,
      },
      hostContext: {
        host: "codex",
      },
      originalFileCount: files.length,
      originalBytes: files.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0),
      sanitizationReport: {
        redactedSecrets: 0,
        redactedIdentifiers: 0,
        removedUrls: 0,
        trimmedFiles: 0,
        unsafeContentDetected: false,
        riskTier: "safe",
        issues: [],
      },
    },
    files,
    touchedFiles: ["sum.js"],
  };
}

function taskFile(path, content) {
  return {
    path,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function requestOverHttp(url, payload, authToken) {
  const response = await fetch(url, {
    method: payload ? "POST" : "GET",
    headers: {
      ...(payload ? { "content-type": "application/json" } : {}),
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });

  return {
    status: response.status,
    body: tryParseJson(await response.text()),
  };
}

async function requestOverSocket(socketPath, path, payload, authToken) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const request = httpRequest(
      {
        method: payload ? "POST" : "GET",
        socketPath,
        path,
        headers: {
          ...(body
            ? {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(body, "utf8")),
              }
            : {}),
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 500,
            body: tryParseJson(responseBody),
          });
        });
      },
    );

    request.on("error", reject);
    request.end(body);
  });
}

function tryParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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
