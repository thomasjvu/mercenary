import assert from "node:assert/strict";
import test from "node:test";
import { resolveCallbackUrl } from "./callbacks.js";

test("resolveCallbackUrl preserves gateway api prefix", () => {
  assert.equal(
    resolveCallbackUrl(
      "/v1/providers/dottie/heartbeat",
      "http://34.7.95.247:8080/api",
    ),
    "http://34.7.95.247:8080/api/v1/providers/dottie/heartbeat",
  );
});

test("resolveCallbackUrl preserves nested api prefix with trailing slash", () => {
  assert.equal(
    resolveCallbackUrl(
      "v1/providers/dottie/submit",
      "https://bossraid.example.com/api/",
    ),
    "https://bossraid.example.com/api/v1/providers/dottie/submit",
  );
});

test("resolveCallbackUrl still works for direct api origins without a path prefix", () => {
  assert.equal(
    resolveCallbackUrl(
      "/v1/providers/dottie/failure",
      "http://127.0.0.1:8787",
    ),
    "http://127.0.0.1:8787/v1/providers/dottie/failure",
  );
});
