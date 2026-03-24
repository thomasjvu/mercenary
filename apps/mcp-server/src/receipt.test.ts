import assert from "node:assert/strict";
import test from "node:test";
import type {
  BossRaidResultOutput,
  BossRaidStatusOutput,
} from "@bossraid/shared-types";
import { summarizeRaidReceipt } from "./receipt.js";

test("summarizeRaidReceipt preserves ERC-8004 verification and ERC-8183 lifecycle proof state", () => {
  const status: BossRaidStatusOutput = {
    raidId: "raid_test",
    status: "settling",
    firstValidAvailable: true,
    bestCurrentScore: 0.92,
    experts: [
      {
        providerId: "provider-alpha",
        status: "submitted",
        latencyMs: 1200,
        heartbeatAgeMs: 500,
        progress: 100,
        message: "submitted result",
      },
    ],
    sanitization: {
      riskTier: "safe",
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  };

  const result: BossRaidResultOutput = {
    raidId: "raid_test",
    status: "settling",
    routingProof: {
      policy: {
        privacyMode: "strict",
        selectionMode: "privacy_first",
        requireErc8004: true,
        minTrustScore: 75,
        allowedModelFamilies: ["venice"],
        requiredPrivacyFeatures: ["no_data_retention"],
        venicePrivateLane: true,
      },
      providers: [
        {
          providerId: "provider-alpha",
          phase: "primary",
          workstreamId: "ws-1",
          workstreamLabel: "analysis",
          roleId: "role-1",
          roleLabel: "implementer",
          modelFamily: "venice",
          veniceBacked: true,
          erc8004Registered: true,
          trustScore: 91,
          trustReason: "verified owner",
          operatorWallet: "0xoperator",
          registrationTx: "0xregistration",
          erc8004VerificationStatus: "verified",
          erc8004VerificationCheckedAt: "2026-03-23T00:00:00.000Z",
          agentRegistry: "eip155:8453:0xregistry",
          agentUri: "ipfs://agent",
          registrationTxFound: true,
          operatorMatchesOwner: true,
          privacyFeatures: ["no_data_retention", "tee_attested"],
          matchedSpecializations: ["analysis"],
          reasons: ["selected_primary", "strict_privacy", "erc8004_required"],
        },
      ],
    },
    rankedSubmissions: [],
    approvedSubmissions: [],
    settlementExecution: {
      mode: "onchain",
      proofStandard: "erc8183_aligned",
      lifecycleStatus: "partial",
      executedAt: "2026-03-23T00:00:00.000Z",
      artifactPath: "temp/settlements/raid_test.json",
      registryRaidRef: "42",
      taskHash: "0xtask",
      evaluationHash: "0xeval",
      successfulProviderIds: ["provider-alpha"],
      contracts: {
        registryAddress: "0xregistry",
        escrowAddress: "0xescrow",
        tokenAddress: "0xtoken",
        clientAddress: "0xclient",
        evaluatorAddress: "0xevaluator",
        chainId: "8453",
      },
      registryCall: {
        method: "finalizeRaid",
        args: ["42", "0xeval"],
      },
      childJobs: [
        {
          jobRef: "raid_test:provider-alpha",
          providerId: "provider-alpha",
          providerAddress: "0xprovider",
          role: "successful",
          status: "complete",
          requestedAction: "complete",
          lifecycleStatus: "submitted",
          budgetUsd: 10,
          budgetAtomic: "10000000",
          submitResultHash: "0xsubmission",
          completionPolicy: "submit and complete child job",
          nextAction: "Evaluator completion is still required.",
          jobId: "7",
          createTxHash: "0xcreate",
          linkTxHash: "0xlink",
          budgetTxHash: "0xbudget",
          fundTxHash: "0xfund",
          submitTxHash: "0xsubmit",
        },
      ],
      finalizeTxHash: "0xfinalize",
      transactionHashes: ["0xcreate", "0xlink", "0xbudget", "0xfund", "0xsubmit"],
      jobIds: ["7"],
      warnings: ["provider-alpha: successful child job is submitted but still awaiting evaluator completion."],
      allocations: [
        {
          providerId: "provider-alpha",
          role: "successful",
          status: "complete",
          totalAmount: 10,
          deliverableHash: "0xsubmission",
        },
      ],
    },
    reputationEvents: [
      {
        providerId: "provider-alpha",
        type: "successful_provider",
        timestamp: "2026-03-23T00:00:00.000Z",
      },
    ],
  };

  const receipt = summarizeRaidReceipt(status, result);

  assert.equal(receipt.routingProof?.providers[0]?.erc8004VerificationStatus, "verified");
  assert.equal(receipt.routingProof?.providers[0]?.erc8004VerificationCheckedAt, "2026-03-23T00:00:00.000Z");
  assert.equal(receipt.routingProof?.providers[0]?.operatorMatchesOwner, true);
  assert.equal(receipt.settlementExecution?.lifecycleStatus, "partial");
  assert.equal(receipt.settlementExecution?.finalizeTxHash, "0xfinalize");
  assert.equal(receipt.settlementExecution?.warnings?.[0]?.includes("awaiting evaluator completion"), true);
  assert.equal(receipt.settlementExecution?.childJobs[0]?.requestedAction, "complete");
  assert.equal(receipt.settlementExecution?.childJobs[0]?.nextAction, "Evaluator completion is still required.");
});
