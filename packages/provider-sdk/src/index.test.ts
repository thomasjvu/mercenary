import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProviderProfilesFromFile } from "./index.js";

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
