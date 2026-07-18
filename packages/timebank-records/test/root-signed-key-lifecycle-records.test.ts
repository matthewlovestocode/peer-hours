import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  canonicalMemberFeedDeclarationPayload,
  canonicalRootSignedMemberSigningKeyLifecyclePayload,
  createSelfOwnedMemberIdentity,
} from "@peer-hours/timebank-identity";
import {
  memberFeedDeclarationToRecord,
  reduceProvenRootSignedMemberSigningKeyLifecycleRecords,
  rootSignedMemberSigningKeyLifecycleFromRecord,
  rootSignedMemberSigningKeyLifecycleToRecord,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";

/** Builds root-signed feed provenance and a separately signed member-device key lifecycle statement. */
function fixture() {
  const root = generateKeyPairSync("ed25519");
  const device = generateKeyPairSync("ed25519");
  const rootPublicKeyPem = root.publicKey.export({ format: "pem", type: "spki" }).toString();
  const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem }).memberId;
  const declarationUnsigned = {
    schema: "peer-hours/member-feed-declaration/v1" as const,
    memberId,
    communityId,
    feedPublicKey: "a".repeat(64),
    occurredAt: "2026-07-18T12:00:00.000Z",
    rootPublicKeyPem,
  };
  const declaration = { ...declarationUnsigned, signature: sign(null, canonicalMemberFeedDeclarationPayload(declarationUnsigned), root.privateKey).toString("base64url") };
  const lifecycleUnsigned = {
    schema: "peer-hours/root-signed-member-key-lifecycle/v1" as const,
    eventId: "member-device-activate",
    communityId,
    memberId,
    keyId: "desktop-2026",
    action: "activate" as const,
    occurredAt: "2026-07-18T12:01:00.000Z",
    publicKeyPem: device.publicKey.export({ format: "pem", type: "spki" }).toString(),
    rootPublicKeyPem,
  };
  const lifecycle = { ...lifecycleUnsigned, signature: sign(null, canonicalRootSignedMemberSigningKeyLifecyclePayload(lifecycleUnsigned), root.privateKey).toString("base64url") };
  return { declaration, lifecycle };
}

test("admits only root-signed device keys that are bound to replicated member-feed provenance", () => {
  const { declaration, lifecycle } = fixture();
  const declarationRecord = memberFeedDeclarationToRecord(declaration);
  const lifecycleRecord = rootSignedMemberSigningKeyLifecycleToRecord(lifecycle);

  assert.deepEqual(rootSignedMemberSigningKeyLifecycleFromRecord(lifecycleRecord), lifecycle);
  assert.deepEqual(
    reduceProvenRootSignedMemberSigningKeyLifecycleRecords({ lifecycleRecords: [lifecycleRecord, lifecycleRecord], memberFeedDeclarationRecords: [declarationRecord] }).map(({ keyId, active }) => ({ keyId, active })),
    [{ keyId: "desktop-2026", active: true }],
  );
  assert.throws(
    () => reduceProvenRootSignedMemberSigningKeyLifecycleRecords({ lifecycleRecords: [lifecycleRecord], memberFeedDeclarationRecords: [] }),
    /requires matching member feed provenance/i,
  );
  assert.throws(() => rootSignedMemberSigningKeyLifecycleFromRecord({ ...lifecycleRecord, authorId: "phm_attacker" }), /envelope must match/i);
});
