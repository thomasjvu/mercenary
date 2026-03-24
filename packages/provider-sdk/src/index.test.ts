import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProviderProfileFromRegistration, loadProviderProfilesFromFile } from "./index.js";

test("loadProviderProfilesFromFile expands env placeholders with default values", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "bossraid-provider-sdk-"));
  const file = join(tempDir, "providers.json");
  await writeFile(
    file,
    JSON.stringify([
      {
        providerId: "provider-defaults",
        displayName: "Provider Defaults",
        endpointType: "http",
        endpoint: "http://provider-defaults:9001",
        specializations: ["analysis"],
        supportedLanguages: ["text"],
        supportedFrameworks: [],
        modelFamily: "venice",
        outputTypes: ["text"],
        pricePerTaskUsd: 1,
        maxConcurrency: 1,
        status: "available",
        auth: {
          type: "bearer",
          token: "${BOSSRAID_PROVIDER_A_TOKEN:-provider-token}",
        },
        erc8004: {
          agentId: "${TEST_ERC8004_AGENT_ID:-8004-provider-defaults}",
          operatorWallet: "${TEST_ERC8004_OPERATOR_WALLET:-0x1111111111111111111111111111111111111111}",
          registrationTx: "${TEST_ERC8004_REGISTRATION_TX:-0xproviderregistration}",
          identityRegistry: "${TEST_ERC8004_IDENTITY_REGISTRY:-0xidentityregistry}"
        }
      }
    ]),
  );

  const [profile] = await loadProviderProfilesFromFile(file);
  assert.equal(profile.auth?.token, "provider-token");
  assert.equal(profile.erc8004?.agentId, "8004-provider-defaults");
  assert.equal(profile.erc8004?.operatorWallet, "0x1111111111111111111111111111111111111111");
  assert.equal(profile.erc8004?.registrationTx, "0xproviderregistration");
});

test("buildProviderProfileFromRegistration preserves ERC-8004 verification payloads", () => {
  const profile = buildProviderProfileFromRegistration({
    agentId: "provider-verified",
    name: "Provider Verified",
    endpoint: "http://127.0.0.1:9001",
    erc8004: {
      agentId: "8004-verified",
      registrationTx: "0xverified",
      verification: {
        status: "verified",
        checkedAt: "2026-03-23T00:00:00.000Z",
        chainId: "8453",
        agentRegistry: "eip155:8453:0xregistry",
        registrationTxFound: true,
        operatorMatchesOwner: true,
      },
    },
  });

  assert.equal(profile.erc8004?.verification?.status, "verified");
  assert.equal(profile.erc8004?.verification?.agentRegistry, "eip155:8453:0xregistry");
  assert.equal(profile.erc8004?.verification?.operatorMatchesOwner, true);
});

test("buildProviderProfileFromRegistration canonicalizes providerId to the registering agent id", () => {
  const profile = buildProviderProfileFromRegistration(
    {
      agentId: "riko",
      name: "Riko",
      endpoint: "http://127.0.0.1:9002",
    },
    {
      providerId: "minimal-diff-hunter",
      agentId: "minimal-diff-hunter",
      displayName: "Old Riko",
      endpointType: "http",
      endpoint: "http://127.0.0.1:9002",
      specializations: ["video-marketing"],
      supportedLanguages: ["text"],
      supportedFrameworks: ["remotion"],
      pricePerTaskUsd: 2,
      maxConcurrency: 1,
      status: "available",
      outputTypes: ["video", "text", "bundle"],
      privacy: {},
      reputation: {
        globalScore: 0.8,
        responsivenessScore: 0.8,
        validityScore: 0.8,
        qualityScore: 0.8,
        timeoutRate: 0,
        duplicateRate: 0,
        specializationScores: {},
        p50LatencyMs: 1000,
        p95LatencyMs: 2000,
        totalRaids: 1,
        totalSuccessfulRaids: 1,
      },
    },
  );

  assert.equal(profile.providerId, "riko");
  assert.equal(profile.agentId, "riko");
});
