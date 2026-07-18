import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  createReplicationReceipt,
  replicationReceiptNodeId,
  replicationReceiptTransferDigest,
  type CommunityManifest,
} from "@peer-hours/peer-runtime";
import { collectVerifiedSettlementDurability, receiptLookupUrl } from "../src/electron/settlement-durability.js";

const transfer = { id: "proposal-1/settlement", sourceProposalId: "proposal-1", communityId: "community-1", fromMemberId: "provider", toMemberId: "receiver", minutes: 60 };

/** Creates pinned availability metadata and one matching signed receipt without any Electron state. */
function receiptFixture(): { community: CommunityManifest; receipt: unknown } {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  const nodeId = replicationReceiptNodeId(publicKey);
  const otherKeys = generateKeyPairSync("ed25519");
  const otherPublicKey = otherKeys.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  const otherNodeId = replicationReceiptNodeId(otherPublicKey);
  const community: CommunityManifest = {
    communityId: "community-1",
    displayName: "Test community",
    protocolVersion: 1,
    role: "bootstrap",
    capabilities: ["discovery-metadata"],
    coreKey: "a".repeat(64),
    bootstrapNodes: [],
    communityNodeUrl: null,
    receiptNodes: [
      { nodeId, publicKey, receiptUrl: "https://community.example/receipts/" },
      { nodeId: otherNodeId, publicKey: otherPublicKey, receiptUrl: "https://community-two.example/receipts/" },
    ],
  };
  const receipt = createReplicationReceipt({
    communityId: community.communityId,
    transferId: transfer.id,
    transferDigest: replicationReceiptTransferDigest(transfer),
    retainedAt: "2026-07-18T12:00:00.000Z",
    privateKey: keys.privateKey,
    publicKey,
  });
  return { community, receipt };
}

test("counts only valid receipts from the matching pinned-node endpoint", async () => {
  const { community, receipt } = receiptFixture();
  const status = await collectVerifiedSettlementDurability({
    community,
    transfers: [transfer],
    fetchReceipt: async () => receipt,
  });
  assert.deepEqual(status, [{ proposalId: "proposal-1", verifiedPinnedReceiptCount: 1 }]);
});

test("treats malformed and unavailable receipt responses as unavailable durability evidence", async () => {
  const { community } = receiptFixture();
  const malformed = await collectVerifiedSettlementDurability({
    community,
    transfers: [transfer],
    fetchReceipt: async () => ({ retainedAt: "not-a-receipt" }),
  });
  const unavailable = await collectVerifiedSettlementDurability({
    community,
    transfers: [transfer],
    fetchReceipt: async () => { throw new Error("node unavailable"); },
  });
  assert.deepEqual(malformed, [{ proposalId: "proposal-1", verifiedPinnedReceiptCount: 0 }]);
  assert.deepEqual(unavailable, [{ proposalId: "proposal-1", verifiedPinnedReceiptCount: 0 }]);
});

test("builds one escaped receipt lookup without retaining an untrusted query string", () => {
  assert.equal(receiptLookupUrl("https://community.example/receipts/?ignored=yes", "a/b c"), "https://community.example/receipts/a%2Fb%20c");
});
