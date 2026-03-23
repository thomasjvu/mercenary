import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProbeInput, SanitizedTaskSpec } from "@bossraid/shared-types";
import { buildEvaluatorServer } from "./index.js";

function createRuntimeProbeInput(): RuntimeProbeInput {
  const files = [
    {
      path: "package.json",
      content: JSON.stringify({
        name: "runtime-probe-fixture",
        private: true,
        scripts: {
          test: "node --test",
        },
      }),
      sha256: "package-json-sha",
    },
    {
      path: "sum.js",
      content: "function sum(a, b) { return a + b; }\nmodule.exports = { sum };\n",
      sha256: "sum-js-sha",
    },
    {
      path: "sum.test.js",
      content: [
        "const test = require('node:test');",
        "const assert = require('node:assert/strict');",
        "const { sum } = require('./sum.js');",
        "",
        "test('sum adds two numbers', () => {",
        "  assert.equal(sum(2, 3), 5);",
        "});",
      ].join("\n"),
      sha256: "sum-test-js-sha",
    },
  ];

  const task: SanitizedTaskSpec = {
    taskTitle: "Fix the addition helper",
    taskDescription: "Ensure the helper returns the correct sum.",
    language: "text",
    files,
    failingSignals: {
      errors: ["sum returned the wrong value"],
      tests: ["sum.test.js"],
      reproSteps: ["Run node --test"],
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
      requireSpecializations: ["node"],
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
    originalFileCount: files.length,
    originalBytes: files.reduce((sum, file) => sum + file.content.length, 0),
    sanitizationReport: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: "safe",
      issues: [],
    },
  };

  return {
    task,
    files,
    touchedFiles: ["sum.js"],
  };
}

test("runtime probe endpoint requires auth when sandbox token is configured", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime-probes",
      payload: createRuntimeProbeInput(),
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "unauthorized",
    });
  } finally {
    await app.close();
  }
});

test("runtime probe endpoint runs node built-in tests inside the evaluator service", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime-probes",
      headers: {
        authorization: "Bearer sandbox-secret",
      },
      payload: createRuntimeProbeInput(),
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      build: { passed: boolean; summary: string };
      tests: { passed: number; failed: number; score: number; summary: string };
    };
    assert.equal(body.build.passed, true);
    assert.match(body.build.summary, /No language-specific build probe available/);
    assert.equal(body.tests.passed, 1);
    assert.equal(body.tests.failed, 0);
    assert.equal(body.tests.score, 1);
    assert.match(body.tests.summary, /Ran inferred Node built-in test suite/);
  } finally {
    await app.close();
  }
});

test("runtime probe endpoint rejects path traversal input", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
  });

  try {
    const payload = createRuntimeProbeInput();
    payload.files[0] = {
      ...payload.files[0],
      path: "../escape.txt",
    };
    payload.task.files[0] = {
      ...payload.task.files[0]!,
      path: "../escape.txt",
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime-probes",
      headers: {
        authorization: "Bearer sandbox-secret",
      },
      payload,
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "invalid_runtime_probe_request",
      message: "workspace path must stay relative: ../escape.txt",
    });
  } finally {
    await app.close();
  }
});

test("runtime probe endpoint enforces configured file limits", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
    BOSSRAID_EVAL_MAX_FILES: "2",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime-probes",
      headers: {
        authorization: "Bearer sandbox-secret",
      },
      payload: createRuntimeProbeInput(),
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "invalid_runtime_probe_request",
      message: "Runtime probe file count exceeds limit (2).",
    });
  } finally {
    await app.close();
  }
});

test("runtime probe endpoint reports per-job worker isolation in health", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
    BOSSRAID_EVAL_JOB_TIMEOUT_MS: "1234",
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      ok: true,
      ready: true,
      hasCapacity: true,
      activeJobs: 0,
      maxConcurrentJobs: 2,
      authConfigured: true,
      bodyLimitBytes: 2097152,
      listener: "tcp",
      jobTimeoutMs: 1234,
      limits: {
        maxFiles: 256,
        maxTotalBytes: 1048576,
        maxFileBytes: 262144,
        maxPathLength: 240,
      },
      sandbox: "per_job_process",
    });
  } finally {
    await app.close();
  }
});

test("runtime probe endpoint reports per-job container isolation in health", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
    BOSSRAID_EVAL_JOB_ISOLATION: "container",
    BOSSRAID_EVAL_JOB_TIMEOUT_MS: "1234",
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().sandbox, "per_job_container");
    assert.equal(response.json().jobTimeoutMs, 1234);
  } finally {
    await app.close();
  }
});

test("runtime probe endpoint rejects container isolation when no job image is configured", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
    BOSSRAID_EVAL_JOB_ISOLATION: "container",
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime-probes",
      headers: {
        authorization: "Bearer sandbox-secret",
      },
      payload: createRuntimeProbeInput(),
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "sandbox_not_configured",
      message: "BOSSRAID_EVAL_JOB_CONTAINER_IMAGE is required for container job isolation.",
    });
  } finally {
    await app.close();
  }
});

test("runtime probe endpoint terminates overlong worker jobs", async () => {
  const app = buildEvaluatorServer({
    BOSSRAID_EVAL_SANDBOX_TOKEN: "sandbox-secret",
    BOSSRAID_EVAL_JOB_TIMEOUT_MS: "100",
  });

  try {
    const payload = createRuntimeProbeInput();
    payload.files[0] = {
      ...payload.files[0],
      content: JSON.stringify({
        name: "runtime-probe-fixture",
        private: true,
        scripts: {
          test: "node --test",
        },
      }),
      sha256: "package-json-timeout-sha",
    };
    payload.task.files[0] = payload.files[0];
    payload.files[2] = {
      ...payload.files[2],
      content: [
        "const test = require('node:test');",
        "",
        "test('never resolves', async () => {",
        "  await new Promise(() => {});",
        "});",
      ].join("\n"),
      sha256: "sum-test-timeout-sha",
    };
    payload.task.files[2] = payload.files[2];

    const response = await app.inject({
      method: "POST",
      url: "/v1/runtime-probes",
      headers: {
        authorization: "Bearer sandbox-secret",
      },
      payload,
    });

    assert.equal(response.statusCode, 504);
    assert.deepEqual(response.json(), {
      error: "sandbox_timeout",
      message: "Runtime probe exceeded 100 ms.",
    });
  } finally {
    await app.close();
  }
});
