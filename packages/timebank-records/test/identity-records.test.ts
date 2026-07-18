import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  createMemberSigningKeyAuthorizationEvent,
  type MemberSigningKeyAuthorization,
  type MemberSigningKeyAuthorizationEvent,
} from "@peer-hours/timebank-identity";
import {
  IDENTITY_KEY_ACTIVATION_RECORD_KIND,
  IDENTITY_KEY_REVOCATION_RECORD_KIND,
  IdentityRecordError,
  memberSigningKeyAuthorizationEventFromRecord,
  memberSigningKeyAuthorizationEventToRecord,
  reduceMemberSigningKeyAuthorizationRecords,
} from "../src/identity-records.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const anotherCommunityId = "peer-hours/earth/online/software";
const memberId = "member-garden-helper";

/** Creates a valid Ed25519 public-key PEM for identity-record fixtures. */
function publicKeyPem(): string {
  return generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
}

/** Creates one valid immutable member-key lifecycle event for record-mapping tests. */
function authorizationEvent(input: {
  readonly eventId: string;
  readonly action: "activate" | "revoke";
  readonly occurredAt: string;
  readonly keyId?: string;
  readonly community?: string;
  readonly publicKey?: string;
}): MemberSigningKeyAuthorizationEvent {
  return createMemberSigningKeyAuthorizationEvent({
    eventId: input.eventId,
    communityId: input.community ?? communityId,
    memberId,
    keyId: input.keyId ?? "garden-helper-key",
    action: input.action,
    occurredAt: input.occurredAt,
    ...(input.action === "activate" ? { publicKeyPem: input.publicKey ?? publicKeyPem() } : {}),
  });
}

test("maps member signing-key activation and revocation events through typed records", () => {
  const activation = authorizationEvent({
    eventId: "identity-activation-1",
    action: "activate",
    occurredAt: "2026-07-18T12:00:00.000Z",
  });
  const revocation = authorizationEvent({
    eventId: "identity-revocation-1",
    action: "revoke",
    occurredAt: "2026-07-18T12:01:00.000Z",
  });

  const activationRecord = memberSigningKeyAuthorizationEventToRecord(activation);
  const revocationRecord = memberSigningKeyAuthorizationEventToRecord(revocation);

  assert.equal(activationRecord.kind, IDENTITY_KEY_ACTIVATION_RECORD_KIND);
  assert.equal(revocationRecord.kind, IDENTITY_KEY_REVOCATION_RECORD_KIND);
  assert.equal(activationRecord.communityId, communityId);
  assert.equal(activationRecord.id, activation.eventId);
  assert.equal(activationRecord.authorId, memberId);
  assert.deepEqual(memberSigningKeyAuthorizationEventFromRecord(activationRecord), activation);
  assert.deepEqual(memberSigningKeyAuthorizationEventFromRecord(revocationRecord), revocation);
});

test("rejects records whose kind, envelope scope, or immutable identity payload terms disagree", () => {
  const activation = authorizationEvent({
    eventId: "identity-activation-1",
    action: "activate",
    occurredAt: "2026-07-18T12:00:00.000Z",
  });
  const record = memberSigningKeyAuthorizationEventToRecord(activation);

  assert.throws(
    () => memberSigningKeyAuthorizationEventFromRecord({ ...record, kind: IDENTITY_KEY_REVOCATION_RECORD_KIND }),
    IdentityRecordError,
  );
  assert.throws(
    () => memberSigningKeyAuthorizationEventFromRecord({ ...record, communityId: anotherCommunityId }),
    IdentityRecordError,
  );
  assert.throws(
    () => memberSigningKeyAuthorizationEventFromRecord({ ...record, id: "identity-activation-other" }),
    IdentityRecordError,
  );
  assert.throws(
    () =>
      memberSigningKeyAuthorizationEventFromRecord({
        ...record,
        payload: { ...record.payload, communityId: anotherCommunityId },
      }),
    IdentityRecordError,
  );
});

test("reduces unordered replicated identity records through the identity lifecycle reducer", () => {
  const activation = authorizationEvent({
    eventId: "identity-activation-1",
    action: "activate",
    occurredAt: "2026-07-18T12:00:00.000Z",
  });
  const revocation = authorizationEvent({
    eventId: "identity-revocation-1",
    action: "revoke",
    occurredAt: "2026-07-18T12:01:00.000Z",
  });

  const authorizations = reduceMemberSigningKeyAuthorizationRecords([
    memberSigningKeyAuthorizationEventToRecord(revocation),
    memberSigningKeyAuthorizationEventToRecord(activation),
    memberSigningKeyAuthorizationEventToRecord(activation),
  ]);

  assert.deepEqual(
    authorizations.map(({ communityId: authorizationCommunityId, memberId: authorizationMemberId, keyId, active }) => ({
      communityId: authorizationCommunityId,
      memberId: authorizationMemberId,
      keyId,
      active,
    })),
    [{ communityId, memberId, keyId: "garden-helper-key", active: false }],
  );
  assert.equal((authorizations[0] as MemberSigningKeyAuthorization).publicKeyPem, activation.publicKeyPem);
});
