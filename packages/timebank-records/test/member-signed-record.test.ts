import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  createMemberSigningKeyAuthorization,
} from "@peer-hours/timebank-identity";
import {
  canonicalMemberSignedRecordPayload,
  createMemberSignedRecord,
  verifyMemberSignedRecord,
} from "../src/member-signed-record.js";
import { createRecordEnvelope } from "../src/envelope.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const memberId = "member-garden-helper";

/** Creates one immutable domain envelope before a member signs its complete contents. */
function record() {
  return createRecordEnvelope({
    id: "proposal-garden-help",
    schema: "peer-hours/timebank-record/v1",
    version: 1,
    kind: "peer-hours/accepted-exchange-proposal/v1",
    communityId,
    occurredAt: "2026-07-18T14:00:00.000Z",
    authorId: memberId,
    payload: { proposalId: "proposal-garden-help", minutes: 90 },
  });
}

/** Creates the active member authorization used to verify a fixture signature. */
function authorization(publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"], active = true) {
  return createMemberSigningKeyAuthorization({
    communityId,
    memberId,
    keyId: "garden-helper-key",
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    active,
  });
}

test("verifies a member signature over every immutable record term", () => {
  const keys = generateKeyPairSync("ed25519");
  const unsigned = record();
  const signed = createMemberSignedRecord({
    ...unsigned,
    signingKeyId: "garden-helper-key",
    signature: sign(null, canonicalMemberSignedRecordPayload(unsigned), keys.privateKey).toString("base64url"),
  });

  assert.equal(verifyMemberSignedRecord(signed, [authorization(keys.publicKey)]), true);
  assert.equal(
    verifyMemberSignedRecord({ ...signed, payload: { ...signed.payload, minutes: 60 } }, [authorization(keys.publicKey)]),
    false,
  );
});

test("rejects signatures from inactive keys or a key authorized to another member", () => {
  const keys = generateKeyPairSync("ed25519");
  const unsigned = record();
  const signed = createMemberSignedRecord({
    ...unsigned,
    signingKeyId: "garden-helper-key",
    signature: sign(null, canonicalMemberSignedRecordPayload(unsigned), keys.privateKey).toString("base64url"),
  });

  assert.equal(verifyMemberSignedRecord(signed, [authorization(keys.publicKey, false)]), false);
  assert.equal(
    verifyMemberSignedRecord(signed, [{ ...authorization(keys.publicKey), memberId: "another-member" }]),
    false,
  );
});
