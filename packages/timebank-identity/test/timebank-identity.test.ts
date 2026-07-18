import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { applyTransfers, createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import {
  canonicalTransferPayload,
  canonicalMemberFeedDeclarationPayload,
  canonicalMemberFeedAnnouncementPayload,
  createMemberFeedAnnouncement,
  createMemberFeedDeclaration,
  createMemberSigningKeyAuthorizationEvent,
  createEd25519SignatureVerifier,
  assertAuthorizedTransferAttestations,
  createMemberSigningKeyAuthorization,
  createSelfOwnedMemberIdentity,
  reduceMemberSigningKeyAuthorizationEvents,
  transferPayloadDigest,
  type MemberSigningKeyAuthorizationEvent,
  type MemberSigningKeyAuthorization,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const anotherCommunityId = "peer-hours/earth/online/software";
const providerMemberId = "member-provider";
const recipientMemberId = "member-recipient";

/** Creates a fresh Ed25519 public/private key pair for one integration-test participant. */
function memberKeyPair(): ReturnType<typeof generateKeyPairSync> {
  return generateKeyPairSync("ed25519");
}

/** Builds a signed declaration linking one self-owned identity to a member-owned Hypercore feed. */
function memberFeedDeclaration(privateKey: ReturnType<typeof memberKeyPair>["privateKey"], publicKey: ReturnType<typeof memberKeyPair>["publicKey"]) {
  const rootPublicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem }).memberId;
  const unsigned = {
    schema: "peer-hours/member-feed-declaration/v1" as const,
    memberId,
    communityId,
    feedPublicKey: "a".repeat(64),
    occurredAt: "2026-07-18T12:00:00.000Z",
    rootPublicKeyPem,
  };
  return { ...unsigned, signature: sign(null, canonicalMemberFeedDeclarationPayload(unsigned), privateKey).toString("base64url") };
}

test("derives a stable self-owned member identity and accepts only its signed member-feed declaration", () => {
  const keys = memberKeyPair();
  const declaration = memberFeedDeclaration(keys.privateKey, keys.publicKey);

  assert.equal(createSelfOwnedMemberIdentity({ rootPublicKeyPem: declaration.rootPublicKeyPem }).memberId, declaration.memberId);
  assert.deepEqual(createMemberFeedDeclaration(declaration), declaration);
  assert.throws(() => createMemberFeedDeclaration({ ...declaration, feedPublicKey: "b".repeat(64) }));
  assert.throws(() => createMemberFeedDeclaration({ ...declaration, memberId: "phm_other" }));
});

test("accepts only an unexpired root-signed announcement for a declared member feed", () => {
  const keys = memberKeyPair();
  const declaration = memberFeedDeclaration(keys.privateKey, keys.publicKey);
  const unsigned = {
    schema: "peer-hours/member-feed-announcement/v1" as const,
    declaration,
    announcedAt: "2026-07-18T12:00:00.000Z",
    expiresAt: "2026-07-19T12:00:00.000Z",
  };
  const announcement = {
    ...unsigned,
    signature: sign(null, canonicalMemberFeedAnnouncementPayload(unsigned), keys.privateKey).toString("base64url"),
  };

  assert.deepEqual(createMemberFeedAnnouncement(announcement), announcement);
  assert.throws(() => createMemberFeedAnnouncement({ ...announcement, expiresAt: unsigned.announcedAt }));
  assert.throws(() => createMemberFeedAnnouncement({ ...announcement, announcedAt: "2026-07-18T12:01:00.000Z" }));
});

/** Signs an exact canonical transfer payload using an ephemeral Ed25519 private key. */
function signTransfer(transfer: Transfer, privateKey: ReturnType<typeof memberKeyPair>["privateKey"]): string {
  return sign(null, canonicalTransferPayload(transfer), privateKey).toString("base64url");
}

/** Builds a community-scoped authorization from an ephemeral test public key. */
function authorization(input: {
  readonly memberId: string;
  readonly keyId: string;
  readonly publicKey: ReturnType<typeof memberKeyPair>["publicKey"];
  readonly community?: string;
  readonly active?: boolean;
}): MemberSigningKeyAuthorization {
  return createMemberSigningKeyAuthorization({
    communityId: input.community ?? communityId,
    memberId: input.memberId,
    keyId: input.keyId,
    publicKeyPem: input.publicKey.export({ format: "pem", type: "spki" }).toString(),
    active: input.active ?? true,
  });
}

/** Creates a valid immutable member signing-key authorization event for reducer tests. */
function authorizationEvent(input: {
  readonly eventId: string;
  readonly memberId?: string;
  readonly keyId?: string;
  readonly action: "activate" | "revoke";
  readonly occurredAt: string;
  readonly publicKey?: ReturnType<typeof memberKeyPair>["publicKey"];
  readonly community?: string;
}): MemberSigningKeyAuthorizationEvent {
  return createMemberSigningKeyAuthorizationEvent({
    eventId: input.eventId,
    communityId: input.community ?? communityId,
    memberId: input.memberId ?? providerMemberId,
    keyId: input.keyId ?? "provider-key",
    action: input.action,
    occurredAt: input.occurredAt,
    ...(input.action === "activate"
      ? { publicKeyPem: (input.publicKey ?? memberKeyPair().publicKey).export({ format: "pem", type: "spki" }).toString() }
      : {}),
  });
}

/** Creates a valid unsigned transfer whose exact terms will be signed in each test. */
function unsignedTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return createTransfer({
    id: "transfer-garden-help",
    communityId,
    sourceProposalId: "proposal-garden-help",
    providerMemberId,
    recipientMemberId,
    minutes: 90,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest: "placeholder-payload-digest", signature: "placeholder-provider" },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: "placeholder-payload-digest", signature: "placeholder-recipient" },
    ],
    ...overrides,
  });
}

/** Applies signatures to an otherwise fixed transfer without changing its canonical terms. */
function signedTransfer(input: {
  readonly transfer?: Transfer;
  readonly providerPrivateKey: ReturnType<typeof memberKeyPair>["privateKey"];
  readonly recipientPrivateKey: ReturnType<typeof memberKeyPair>["privateKey"];
}): Transfer {
  const transfer = input.transfer ?? unsignedTransfer();
  const payloadDigest = transferPayloadDigest(transfer);
  return createTransfer({
    ...transfer,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest, signature: signTransfer(transfer, input.providerPrivateKey) },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest, signature: signTransfer(transfer, input.recipientPrivateKey) },
    ],
  });
}

test("accepts valid authorized provider and recipient signatures over deterministic transfer terms", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[0] }), true);
  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[1] }), true);
  assert.deepEqual(
    canonicalTransferPayload(transfer),
    canonicalTransferPayload({
      ...transfer,
      attestations: [
        { memberId: providerMemberId, keyId: "provider-key", payloadDigest: transferPayloadDigest(transfer), signature: "different-provider-signature" },
        { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: transferPayloadDigest(transfer), signature: "different-recipient-signature" },
      ],
    }),
  );
  assert.deepEqual(applyTransfers({ communityId, transfers: [transfer], verifyAttestation }).balances, {
    [providerMemberId]: 90,
    [recipientMemberId]: -90,
  });
});

test("admits a transfer only when both participant signatures are authorized for its exact canonical terms", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const authorizations = [
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ];

  assert.deepEqual(assertAuthorizedTransferAttestations(transfer, authorizations), transfer);
  assert.throws(
    () => assertAuthorizedTransferAttestations({ ...transfer, minutes: 45 }, authorizations),
    /valid authorized Ed25519 transfer attestation/i,
  );
  assert.throws(
    () => assertAuthorizedTransferAttestations(transfer, authorizations.slice(0, 1)),
    /valid authorized Ed25519 transfer attestation/i,
  );
});

test("rejects an attestation with a mismatched payload digest or another active key id", () => {
  const providerKeys = memberKeyPair();
  const providerRotatedKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifier = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: providerMemberId, keyId: "provider-rotated-key", publicKey: providerRotatedKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);
  const mismatchedDigest = { ...transfer.attestations[0], payloadDigest: transferPayloadDigest({ ...transfer, minutes: 45 }) };
  const mismatchedKey = { ...transfer.attestations[0], keyId: "provider-rotated-key" };

  assert.equal(verifier({ transfer, attestation: mismatchedDigest }), false);
  assert.equal(verifier({ transfer, attestation: mismatchedKey }), false);
});

test("rejects a valid signature when its key is authorized for another community", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey, community: anotherCommunityId }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[0] }), false);
  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[1] }), true);
});

test("rejects signatures from inactive or unknown keys", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const unknownKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const inactiveVerifier = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey, active: false }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);
  const unknownVerifier = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: unknownKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(inactiveVerifier({ transfer, attestation: transfer.attestations[0] }), false);
  assert.equal(unknownVerifier({ transfer, attestation: transfer.attestations[0] }), false);
});

test("rejects a signature made by a key authorized to a different member", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: recipientKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[0] }), false);
});

test("rejects a valid signature after any signed transfer term is tampered with", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const tamperedTransfer = createTransfer({ ...transfer, minutes: transfer.minutes + 1 });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer: tamperedTransfer, attestation: tamperedTransfer.attestations[0] }), false);
  assert.equal(verifyAttestation({ transfer: tamperedTransfer, attestation: tamperedTransfer.attestations[1] }), false);
});

test("reduces an unordered activation history into an active community-scoped authorization", () => {
  const keys = memberKeyPair();
  const event = authorizationEvent({
    eventId: "event-provider-activate",
    action: "activate",
    occurredAt: "2026-07-18T12:00:00.000Z",
    publicKey: keys.publicKey,
  });

  const authorizations = reduceMemberSigningKeyAuthorizationEvents([event]);

  assert.deepEqual(authorizations, [
    createMemberSigningKeyAuthorization({
      communityId,
      memberId: providerMemberId,
      keyId: "provider-key",
      publicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString(),
      active: true,
    }),
  ]);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(authorizations[0]), true);
});

test("reduces a later revocation to an inactive authorization regardless of arrival order", () => {
  const keys = memberKeyPair();
  const activation = authorizationEvent({
    eventId: "event-provider-activate",
    action: "activate",
    occurredAt: "2026-07-18T12:00:00.000Z",
    publicKey: keys.publicKey,
  });
  const revocation = authorizationEvent({
    eventId: "event-provider-revoke",
    action: "revoke",
    occurredAt: "2026-07-18T12:01:00.000Z",
  });

  const authorizations = reduceMemberSigningKeyAuthorizationEvents([revocation, activation]);

  assert.equal(authorizations.length, 1);
  assert.equal(authorizations[0].active, false);
  assert.equal(authorizations[0].publicKeyPem, activation.publicKeyPem);
});

test("keeps independently active rotated keys and scopes them by community and member", () => {
  const originalKeys = memberKeyPair();
  const rotatedKeys = memberKeyPair();
  const otherMemberKeys = memberKeyPair();
  const otherCommunityKeys = memberKeyPair();
  const authorizations = reduceMemberSigningKeyAuthorizationEvents([
    authorizationEvent({ eventId: "event-other-community", action: "activate", occurredAt: "2026-07-18T12:04:00.000Z", publicKey: otherCommunityKeys.publicKey, community: anotherCommunityId }),
    authorizationEvent({ eventId: "event-original", action: "activate", occurredAt: "2026-07-18T12:00:00.000Z", publicKey: originalKeys.publicKey }),
    authorizationEvent({ eventId: "event-other-member", action: "activate", occurredAt: "2026-07-18T12:03:00.000Z", publicKey: otherMemberKeys.publicKey, memberId: recipientMemberId }),
    authorizationEvent({ eventId: "event-rotated", action: "activate", occurredAt: "2026-07-18T12:02:00.000Z", publicKey: rotatedKeys.publicKey, keyId: "provider-key-rotated" }),
  ]);

  assert.deepEqual(
    authorizations.map(({ communityId: authorizationCommunityId, memberId, keyId, active }) => ({ authorizationCommunityId, memberId, keyId, active })),
    [
      { authorizationCommunityId: communityId, memberId: providerMemberId, keyId: "provider-key", active: true },
      { authorizationCommunityId: communityId, memberId: providerMemberId, keyId: "provider-key-rotated", active: true },
      { authorizationCommunityId: communityId, memberId: recipientMemberId, keyId: "provider-key", active: true },
      { authorizationCommunityId: anotherCommunityId, memberId: providerMemberId, keyId: "provider-key", active: true },
    ],
  );
});

test("deduplicates identical replicated events but rejects conflicting events with the same id", () => {
  const keys = memberKeyPair();
  const event = authorizationEvent({ eventId: "event-provider-activate", action: "activate", occurredAt: "2026-07-18T12:00:00.000Z", publicKey: keys.publicKey });
  const conflict = authorizationEvent({ eventId: "event-provider-activate", action: "revoke", occurredAt: "2026-07-18T12:01:00.000Z" });

  assert.deepEqual(
    reduceMemberSigningKeyAuthorizationEvents([event, event]),
    reduceMemberSigningKeyAuthorizationEvents([event]),
  );
  assert.throws(
    () => reduceMemberSigningKeyAuthorizationEvents([event, conflict]),
    /same event id/i,
  );
});

test("rejects malformed authorization lifecycle events before reduction", () => {
  const keys = memberKeyPair();

  assert.throws(
    () =>
      createMemberSigningKeyAuthorizationEvent({
        eventId: "event-invalid-timestamp",
        communityId,
        memberId: providerMemberId,
        keyId: "provider-key",
        action: "activate",
        occurredAt: "tomorrow",
        publicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString(),
      }),
    /canonical UTC ISO-8601/i,
  );
});
