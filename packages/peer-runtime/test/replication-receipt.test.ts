import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  createReplicationReceipt,
  normalizeCommunityReceiptNode,
  replicationReceiptNodeId,
  replicationReceiptTransferDigest,
  verifyReplicationReceipt,
} from "../src/replication-receipt.js";

/** Creates one ephemeral pinned identity for receipt-only cryptographic tests. */
function receiptSigner() {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  return { privateKey: pair.privateKey, publicKey, nodeId: replicationReceiptNodeId(publicKey) };
}

test("verifies a signed retention receipt only for its exact pinned node and transfer terms", () => {
  const signer = receiptSigner();
  const digest = replicationReceiptTransferDigest({ id: "proposal-1/settlement", minutes: 60, attestations: ["a", "b"] });
  const receipt = createReplicationReceipt({
    communityId: "peer-hours/test",
    transferId: "proposal-1/settlement",
    transferDigest: digest,
    retainedAt: "2026-07-18T12:00:00.000Z",
    ...signer,
  });
  const trusted = [normalizeCommunityReceiptNode({ nodeId: signer.nodeId, publicKey: signer.publicKey, receiptUrl: "https://node.example.test/receipts/" })];
  assert.equal(verifyReplicationReceipt({ receipt, trustedNodes: trusted, communityId: "peer-hours/test", transferId: "proposal-1/settlement", transferDigest: digest }), true);
  assert.equal(verifyReplicationReceipt({ receipt, trustedNodes: trusted, transferId: "another-transfer" }), false);
  assert.equal(verifyReplicationReceipt({ receipt: { ...receipt, retainedAt: "2026-07-18T12:01:00.000Z" }, trustedNodes: trusted }), false);
  assert.equal(verifyReplicationReceipt({ receipt, trustedNodes: [] }), false);
});

test("makes transfer digests independent of JSON insertion order without accepting non-JSON content", () => {
  assert.equal(replicationReceiptTransferDigest({ b: 2, a: [true, { z: "value" }] }), replicationReceiptTransferDigest({ a: [true, { z: "value" }], b: 2 }));
  assert.throws(() => replicationReceiptTransferDigest({ invalid: Number.NaN }), /finite JSON/);
});

test("rejects receipt metadata that does not cryptographically bind its node id to its public key", () => {
  const signer = receiptSigner();
  assert.throws(() => normalizeCommunityReceiptNode({ nodeId: "a".repeat(64), publicKey: signer.publicKey, receiptUrl: "https://node.example.test" }), /match/);
  assert.throws(() => normalizeCommunityReceiptNode({ nodeId: signer.nodeId, publicKey: signer.publicKey, receiptUrl: "file:///private/receipt" }), /HTTP\(S\)/);
});
