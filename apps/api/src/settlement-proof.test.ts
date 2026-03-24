import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SettlementExecutionRecord } from "@bossraid/shared-types";
import {
  persistSettlementExecutionArtifact,
  refreshSettlementExecutionWithClient,
} from "./settlement-proof.js";

function createRecord(): SettlementExecutionRecord {
  return {
    mode: "onchain",
    proofStandard: "erc8183_aligned",
    lifecycleStatus: "partial",
    executedAt: "2026-03-23T00:00:00.000Z",
    artifactPath: "temp/settlements/raid_test.settlement.json",
    registryRaidRef: "42",
    taskHash: "0xtask",
    evaluationHash: "0xeval",
    successfulProviderIds: ["provider-alpha"],
    allocations: [
      {
        providerId: "provider-alpha",
        role: "successful",
        status: "complete",
        totalAmount: 10,
        deliverableHash: "0xsubmission",
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
      args: ["42", "0xeval"],
    },
    childJobs: [
      {
        jobRef: "raid_test:provider-alpha",
        providerId: "provider-alpha",
        providerAddress: "0x0000000000000000000000000000000000000106",
        role: "successful",
        status: "complete",
        requestedAction: "complete",
        lifecycleStatus: "submitted",
        budgetUsd: 10,
        budgetAtomic: "10000000",
        submitResultHash: null,
        completionPolicy: "submit and complete child job",
        nextAction: "Evaluator completion is still required from the configured evaluator wallet.",
        jobId: "7",
      },
    ],
  };
}

test("refreshSettlementExecutionWithClient marks completed and finalized jobs as terminal", async () => {
  const client = {
    async readContract(input: { functionName: string }) {
      if (input.functionName === "jobs") {
        return {
          provider: "0x0000000000000000000000000000000000000106",
          budget: 10_000_000n,
          deliverableHash: "0xsubmission",
          status: 3n,
        };
      }

      return {
        evaluationHash: "0xeval",
        finalized: true,
      };
    },
  };

  const refreshed = await refreshSettlementExecutionWithClient(createRecord(), { client });

  assert.equal(refreshed.lifecycleStatus, "terminal");
  assert.equal(refreshed.childJobs[0]?.lifecycleStatus, "completed");
  assert.equal(refreshed.childJobs[0]?.submitResultHash, "0xsubmission");
  assert.equal(refreshed.childJobs[0]?.nextAction, null);
  assert.equal(
    refreshed.warnings?.includes("Raid is finalized onchain but finalizeTxHash was not recorded in the settlement proof."),
    true,
  );
});

test("refreshSettlementExecutionWithClient keeps pending onchain steps visible", async () => {
  const client = {
    async readContract(input: { functionName: string }) {
      if (input.functionName === "jobs") {
        return {
          provider: "0x0000000000000000000000000000000000000106",
          budget: 10_000_000n,
          deliverableHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          status: 2n,
        };
      }

      return {
        evaluationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        finalized: false,
      };
    },
  };

  const refreshed = await refreshSettlementExecutionWithClient(createRecord(), { client });

  assert.equal(refreshed.lifecycleStatus, "partial");
  assert.equal(refreshed.childJobs[0]?.lifecycleStatus, "submitted");
  assert.equal(
    refreshed.childJobs[0]?.nextAction,
    "Evaluator completion is still required from the configured evaluator wallet.",
  );
  assert.equal(
    refreshed.warnings?.includes(
      "provider-alpha: Evaluator completion is still required from the configured evaluator wallet.",
    ),
    true,
  );
  assert.equal(refreshed.warnings?.includes("Parent raid is not finalized onchain."), true);
});

test("persistSettlementExecutionArtifact rewrites stale settlement artifact files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "bossraid-settlement-proof-"));
  const artifactPath = join(tempDir, "raid_1.settlement.json");
  const record = createRecord();
  record.artifactPath = artifactPath;
  record.lifecycleStatus = "terminal";
  record.finalizeTxHash = "0xfinalized";
  record.childJobs[0] = {
    ...record.childJobs[0]!,
    lifecycleStatus: "completed",
    nextAction: null,
    submitResultHash: "0xsubmission",
  };

  await writeFile(
    artifactPath,
    JSON.stringify({
      raidId: "raid_1",
      mode: "onchain",
      lifecycleStatus: "partial",
      childJobs: [
        {
          providerId: "provider-alpha",
          lifecycleStatus: "submitted",
        },
      ],
    }),
    "utf8",
  );

  try {
    await persistSettlementExecutionArtifact(record);
    const persisted = JSON.parse(await readFile(artifactPath, "utf8")) as {
      lifecycleStatus: string;
      finalizeTxHash?: string;
      childJobs?: Array<{ lifecycleStatus?: string; submitResultHash?: string | null }>;
    };

    assert.equal(persisted.lifecycleStatus, "terminal");
    assert.equal(persisted.finalizeTxHash, "0xfinalized");
    assert.equal(persisted.childJobs?.[0]?.lifecycleStatus, "completed");
    assert.equal(persisted.childJobs?.[0]?.submitResultHash, "0xsubmission");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
