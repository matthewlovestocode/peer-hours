import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  canonicalMemberFeedDeclarationPayload,
  createSelfOwnedMemberIdentity,
} from "@peer-hours/timebank-identity";
import {
  memberFeedDeclarationFromRecord,
  memberFeedDeclarationToRecord,
  memberFeedDeclarationsToAuthorizations,
  rootKeyIdForMember,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";

/** Creates a root-signed declaration fixture for an independently owned member feed. */
function declaration() {
  const keys = generateKeyPairSync("ed25519");
  const rootPublicKeyPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem }).memberId;
  const unsigned = {
    schema: "peer-hours/member-feed-declaration/v1" as const,
    memberId,
    communityId,
    feedPublicKey: "a".repeat(64),
    occurredAt: "2026-07-18T12:00:00.000Z",
    rootPublicKeyPem,
  };
  return {
    ...unsigned,
    signature: sign(null, canonicalMemberFeedDeclarationPayload(unsigned), keys.privateKey).toString("base64url"),
  };
}

test("maps a root-signed feed declaration into an envelope and independent verifier authorization", () => {
  const source = declaration();
  const record = memberFeedDeclarationToRecord(source);
  const authorizations = memberFeedDeclarationsToAuthorizations([record]);

  assert.deepEqual(memberFeedDeclarationFromRecord(record), source);
  assert.deepEqual(authorizations, [{
    communityId,
    memberId: source.memberId,
    keyId: rootKeyIdForMember(source.memberId),
    publicKeyPem: source.rootPublicKeyPem,
    active: true,
  }]);
});

test("rejects a declaration envelope whose unsigned metadata no longer matches the root-signed terms", () => {
  const source = declaration();
  const record = memberFeedDeclarationToRecord(source);
  assert.throws(() => memberFeedDeclarationFromRecord({ ...record, authorId: "phm_someone-else" }));
  assert.throws(() => memberFeedDeclarationFromRecord({ ...record, payload: { ...source, communityId: "peer-hours/earth/online/software" } }));
});
