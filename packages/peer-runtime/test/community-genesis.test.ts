import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { canonicalCommunityGenesisPayload, createCommunityGenesis, createCommunityInvitation, decodeCommunityInvitation, encodeCommunityInvitation } from "../src/index.js";

/** Builds a valid self-certifying genesis fixture with a real Ed25519 root signature. */
function genesis() {
  const keys = generateKeyPairSync("ed25519");
  const unsigned = { schema: "peer-hours/community-genesis/v1" as const, communityId: "a".repeat(64), discoveryKey: "b".repeat(64), displayName: "Oakland Timebank", location: { locality: "Oakland", region: "California", country: "US" }, createdAt: "2026-07-19T00:00:00.000Z", creatorMemberId: "phm_creator", creatorRootPublicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString() };
  return { ...unsigned, signature: sign(null, canonicalCommunityGenesisPayload(unsigned), keys.privateKey).toString("base64url") };
}

test("accepts a correctly root-signed genesis record", () => {
  const record = genesis();
  assert.equal(createCommunityGenesis(record).communityId, record.communityId);
});

test("rejects a genesis record whose signed discovery scope is modified", () => {
  const record = genesis();
  assert.throws(() => createCommunityGenesis({ ...record, discoveryKey: "c".repeat(64) }), /signature is invalid/);
});

test("round-trips a bounded portable community invitation", () => {
  const invitation = createCommunityInvitation({ schema: "peer-hours/community-invitation/v1", communityId: "a".repeat(64), discoveryKey: "b".repeat(64) });
  assert.deepEqual(decodeCommunityInvitation(encodeCommunityInvitation(invitation)), invitation);
});
