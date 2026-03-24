import test from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";
import type { Erc8004Identity } from "@bossraid/shared-types";
import { verifyErc8004IdentityWithClient } from "./erc8004.js";

test("verifyErc8004IdentityWithClient marks a fully reachable identity as verified", async () => {
  const identity: Erc8004Identity = {
    agentId: "22",
    operatorWallet: "0x00000000000000000000000000000000000000aa",
    registrationTx: "0x1111111111111111111111111111111111111111111111111111111111111111",
    identityRegistry: "0x00000000000000000000000000000000000000bb",
    reputationRegistry: "0x00000000000000000000000000000000000000cc",
    validationRegistry: "0x00000000000000000000000000000000000000dd",
  };
  const client = {
    async getBytecode({ address }: { address: string }) {
      const normalized = getAddress(address);
      return normalized === getAddress(identity.identityRegistry!) ||
        normalized === getAddress(identity.reputationRegistry!) ||
        normalized === getAddress(identity.validationRegistry!)
        ? "0x1234"
        : undefined;
    },
    async readContract({
      functionName,
    }: {
      functionName: string;
    }) {
      if (functionName === "ownerOf") {
        return getAddress(identity.operatorWallet!);
      }
      if (functionName === "tokenURI") {
        return "ipfs://agent-registration";
      }
      throw new Error(`Unexpected function: ${functionName}`);
    },
    async getTransactionReceipt() {
      return { status: "success" };
    },
  } as unknown as Parameters<typeof verifyErc8004IdentityWithClient>[1]["client"];

  const verification = await verifyErc8004IdentityWithClient(identity, {
    client,
    chainId: "8453",
    now: Date.parse("2026-03-23T12:00:00.000Z"),
  });

  assert.equal(verification.status, "verified");
  assert.equal(verification.agentRegistry, "eip155:8453:0x00000000000000000000000000000000000000bb");
  assert.equal(verification.owner, getAddress(identity.operatorWallet!));
  assert.equal(verification.agentUri, "ipfs://agent-registration");
  assert.equal(verification.registrationTxFound, true);
  assert.equal(verification.operatorMatchesOwner, true);
});

test("verifyErc8004IdentityWithClient fails when agentId is not numeric", async () => {
  const verification = await verifyErc8004IdentityWithClient(
    {
      agentId: "mercenary-mainnet-8004",
      identityRegistry: "0x00000000000000000000000000000000000000bb",
    },
    {
      client: {
        async getBytecode() {
          return "0x1234";
        },
        async readContract() {
          throw new Error("should not be called");
        },
        async getTransactionReceipt() {
          return { status: "success" };
        },
      } as unknown as Parameters<typeof verifyErc8004IdentityWithClient>[1]["client"],
      chainId: "8453",
    },
  );

  assert.equal(verification.status, "failed");
  assert.match(verification.notes?.join(" ") ?? "", /numeric ERC-721 token id/);
});
