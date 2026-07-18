import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { type ExchangeProposal } from "@peer-hours/timebank-domain";
import {
  canonicalMemberFeedDeclarationPayload,
  canonicalTransferPayload,
  createSelfOwnedMemberIdentity,
  createMemberSigningKeyAuthorizationEvent,
  transferPayloadDigest,
} from "@peer-hours/timebank-identity";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import { createSettlementAcknowledgement } from "@peer-hours/timebank-settlement";
import {
  memberSigningKeyAuthorizationEventToRecord,
  memberFeedDeclarationToRecord,
  canonicalMemberSignedRecordPayload,
  createMemberSignedRecord,
  resolveTimebankRecords,
  resolveTimebankMemberFeeds,
  rootKeyIdForMember,
  toAcceptedExchangeProposalRecord,
  toLedgerTransferRecord,
  toProposedExchangeProposalRecord,
  toSettlementAcknowledgementRecord,
  type RecordEnvelope,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const providerMemberId = "member-provider";
const recipientMemberId = "member-recipient";
const metadata = { occurredAt: "2026-07-18T13:00:00.000Z", authorId: providerMemberId };

/** Exports an ephemeral Ed25519 public key as the PEM used by identity records. */
function publicKeyPem(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): string {
  return key.export({ format: "pem", type: "spki" }).toString();
}

/** Builds the accepted proposal that a normal transfer must settle exactly. */
function proposal(): ExchangeProposal {
  return {
    id: "proposal-garden-help",
    communityId,
    offerId: "offer-garden-help",
    requestId: "request-garden-help",
    providerMemberId,
    receiverMemberId: recipientMemberId,
    creatorMemberId: providerMemberId,
    acceptedByMemberId: recipientMemberId,
    minutes: 90,
    status: "accepted",
  };
}

/** Creates the creator-signed pending form for the matching accepted proposal fixture. */
function pendingProposal(): ExchangeProposal {
  const { acceptedByMemberId: _acceptedByMemberId, ...pending } = proposal();
  return { ...pending, status: "proposed" };
}

/** Creates the two signed attestations over immutable transfer terms. */
function signedTransfer(
  providerPrivateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  recipientPrivateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  overrides: Partial<Transfer> = {},
): Transfer {
  const unsigned = createTransfer({
    id: "transfer-garden-help",
    communityId,
    sourceProposalId: proposal().id,
    providerMemberId,
    recipientMemberId,
    minutes: 90,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest: "placeholder", signature: "placeholder" },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: "placeholder", signature: "placeholder" },
    ],
    ...overrides,
  });
  const digest = transferPayloadDigest(unsigned);
  return createTransfer({
    ...unsigned,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest: digest, signature: sign(null, canonicalTransferPayload(unsigned), providerPrivateKey).toString("base64url") },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: digest, signature: sign(null, canonicalTransferPayload(unsigned), recipientPrivateKey).toString("base64url") },
    ],
  });
}

/** Signs a complete immutable record with the member key named by its envelope author. */
function signedRecord(
  record: RecordEnvelope,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  signingKeyId: string,
) {
  return createMemberSignedRecord({
    ...record,
    signingKeyId,
    signature: sign(null, canonicalMemberSignedRecordPayload(record), privateKey).toString("base64url"),
  });
}

test("resolves unordered replicated key, proposal, and transfer records into deterministic balances", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const transfer = signedTransfer(providerKeys.privateKey, recipientKeys.privateKey);
  const records: readonly RecordEnvelope[] = [
    signedRecord(toLedgerTransferRecord(transfer, { ...metadata, occurredAt: "2026-07-18T13:02:00.000Z" }), providerKeys.privateKey, "provider-key"),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
    signedRecord(toAcceptedExchangeProposalRecord(proposal(), { ...metadata, authorId: recipientMemberId, occurredAt: "2026-07-18T13:01:00.000Z" }), recipientKeys.privateKey, "recipient-key"),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
  ];

  const state = resolveTimebankRecords(communityId, [records[0], records[3], records[1], records[2], records[0]]);
  assert.deepEqual(state.ledger.balances, { [providerMemberId]: 90, [recipientMemberId]: -90 });
  assert.equal(state.acceptedProposals.length, 1);
  assert.equal(state.authorizations.filter(({ active }) => active).length, 2);
});

test("admits an accepted proposal from a self-owned root identity without a community authorization event", () => {
  const recipientKeys = generateKeyPairSync("ed25519");
  const rootPublicKeyPem = publicKeyPem(recipientKeys.publicKey);
  const recipientId = createSelfOwnedMemberIdentity({ rootPublicKeyPem }).memberId;
  const unsignedDeclaration = {
    schema: "peer-hours/member-feed-declaration/v1" as const,
    memberId: recipientId,
    communityId,
    feedPublicKey: "a".repeat(64),
    occurredAt: "2026-07-18T13:00:00.000Z",
    rootPublicKeyPem,
  };
  const declaration = {
    ...unsignedDeclaration,
    signature: sign(null, canonicalMemberFeedDeclarationPayload(unsignedDeclaration), recipientKeys.privateKey).toString("base64url"),
  };
  const acceptedProposal: ExchangeProposal = {
    ...proposal(),
    receiverMemberId: recipientId,
    acceptedByMemberId: recipientId,
  };
  const proposalRecord = toAcceptedExchangeProposalRecord(acceptedProposal, { ...metadata, authorId: recipientId, occurredAt: "2026-07-18T13:01:00.000Z" });
  const signedProposal = signedRecord(proposalRecord, recipientKeys.privateKey, rootKeyIdForMember(recipientId));

  const declarationRecord = memberFeedDeclarationToRecord(declaration);
  const state = resolveTimebankMemberFeeds(communityId, [{
    feedPublicKey: declaration.feedPublicKey,
    records: [signedProposal, declarationRecord],
  }]);
  assert.equal(state.acceptedProposals.length, 1);
  assert.equal(state.authorizations[0]?.memberId, recipientId);
  assert.throws(
    () => resolveTimebankMemberFeeds(communityId, [{ feedPublicKey: "b".repeat(64), records: [signedProposal, declarationRecord] }]),
    /declared.*identity/i,
  );
});

test("rejects a member-originated domain record without a valid authorized signature", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const unsignedProposal = toAcceptedExchangeProposalRecord(proposal(), { ...metadata, authorId: recipientMemberId });
  const records: readonly RecordEnvelope[] = [
    unsignedProposal,
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
  ];

  assert.throws(() => resolveTimebankRecords(communityId, records), /signed.*member|signature/i);
});

test("rejects an accepted proposal signed by its creator instead of its acceptor", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const creatorRecord = signedRecord(
    { ...toAcceptedExchangeProposalRecord(proposal(), { ...metadata, authorId: recipientMemberId }), authorId: providerMemberId },
    providerKeys.privateKey,
    "provider-key",
  );
  const records: readonly RecordEnvelope[] = [
    creatorRecord,
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
  ];

  assert.throws(() => resolveTimebankRecords(communityId, records), /proposal record must be signed by the member who accepted it/i);
});

test("accepts an accepted proposal signed by its acceptor", () => {
  const recipientKeys = generateKeyPairSync("ed25519");
  const acceptorRecord = signedRecord(
    toAcceptedExchangeProposalRecord(proposal(), { ...metadata, authorId: recipientMemberId }),
    recipientKeys.privateKey,
    "recipient-key",
  );
  const records: readonly RecordEnvelope[] = [
    acceptorRecord,
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
  ];

  assert.equal(resolveTimebankRecords(communityId, records).acceptedProposals.length, 1);
});

test("resolves matching creator-signed pending and acceptor-signed acceptance records", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const pending = pendingProposal();
  const accepted = proposal();
  const records: readonly RecordEnvelope[] = [
    signedRecord(
      toProposedExchangeProposalRecord(pending, metadata),
      providerKeys.privateKey,
      "provider-key",
    ),
    signedRecord(
      toAcceptedExchangeProposalRecord(accepted, { ...metadata, authorId: recipientMemberId }),
      recipientKeys.privateKey,
      "recipient-key",
    ),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
  ];

  const state = resolveTimebankRecords(communityId, records);
  assert.deepEqual(state.proposedProposals, [pending]);
  assert.deepEqual(state.acceptedProposals, [accepted]);
});

test("keeps a one-sided settlement acknowledgement out of final state until the counterparty signs", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const accepted = proposal();
  const baseRecords: readonly RecordEnvelope[] = [
    signedRecord(toAcceptedExchangeProposalRecord(accepted, { ...metadata, authorId: recipientMemberId }), recipientKeys.privateKey, "recipient-key"),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
  ];
  const providerAcknowledgement = signedRecord(
    toSettlementAcknowledgementRecord(createSettlementAcknowledgement(accepted, providerMemberId), { ...metadata, occurredAt: "2026-07-18T13:02:00.000Z" }),
    providerKeys.privateKey,
    "provider-key",
  );
  const recipientAcknowledgement = signedRecord(
    toSettlementAcknowledgementRecord(createSettlementAcknowledgement(accepted, recipientMemberId), { ...metadata, authorId: recipientMemberId, occurredAt: "2026-07-18T13:03:00.000Z" }),
    recipientKeys.privateKey,
    "recipient-key",
  );

  const awaiting = resolveTimebankRecords(communityId, [...baseRecords, providerAcknowledgement]);
  assert.equal(awaiting.settlementConfirmations[0]?.status, "awaiting-counterparty");
  assert.equal(awaiting.ledger.transfers.length, 0);

  const confirmed = resolveTimebankRecords(communityId, [...baseRecords, providerAcknowledgement, recipientAcknowledgement]);
  assert.equal(confirmed.settlementConfirmations[0]?.status, "dual-confirmed");
  assert.equal(confirmed.ledger.transfers.length, 0);
});

test("rejects an acceptance that changes a creator-signed pending proposal's immutable terms", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const records: readonly RecordEnvelope[] = [
    signedRecord(
      toProposedExchangeProposalRecord(pendingProposal(), metadata),
      providerKeys.privateKey,
      "provider-key",
    ),
    signedRecord(
      toAcceptedExchangeProposalRecord({ ...proposal(), minutes: 60 }, { ...metadata, authorId: recipientMemberId }),
      recipientKeys.privateKey,
      "recipient-key",
    ),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
  ];

  assert.throws(
    () => resolveTimebankRecords(communityId, records),
    /preserve every immutable term/i,
  );
});

test("accepts settlement records submitted by either transfer participant and rejects outsiders", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const outsiderMemberId = "member-outsider";
  const outsiderKeys = generateKeyPairSync("ed25519");
  const transfer = signedTransfer(providerKeys.privateKey, recipientKeys.privateKey);
  const records: readonly RecordEnvelope[] = [
    signedRecord(toAcceptedExchangeProposalRecord(proposal(), { ...metadata, authorId: recipientMemberId }), recipientKeys.privateKey, "recipient-key"),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "outsider-key-activation", communityId, memberId: outsiderMemberId, keyId: "outsider-key", action: "activate", occurredAt: "2026-07-18T13:00:02.000Z", publicKeyPem: publicKeyPem(outsiderKeys.publicKey),
    })),
  ];

  for (const [authorId, privateKey, keyId] of [
    [providerMemberId, providerKeys.privateKey, "provider-key"],
    [recipientMemberId, recipientKeys.privateKey, "recipient-key"],
  ] as const) {
    const settlementRecord = signedRecord(
      toLedgerTransferRecord(transfer, { ...metadata, authorId, occurredAt: "2026-07-18T13:02:00.000Z" }),
      privateKey,
      keyId,
    );
    assert.equal(resolveTimebankRecords(communityId, [...records, settlementRecord]).transfers.length, 1);
  }

  const outsiderRecord = signedRecord(
    toLedgerTransferRecord(transfer, { ...metadata, authorId: outsiderMemberId, occurredAt: "2026-07-18T13:02:00.000Z" }),
    outsiderKeys.privateKey,
    "outsider-key",
  );

  assert.throws(() => resolveTimebankRecords(communityId, [...records, outsiderRecord]), /ledger transfer record must be submitted by one of its participants/i);
});

test("rejects a member record whose signed immutable envelope was changed before replication", () => {
  const recipientKeys = generateKeyPairSync("ed25519");
  const signedProposal = signedRecord(
    toAcceptedExchangeProposalRecord(proposal(), { ...metadata, authorId: recipientMemberId }),
    recipientKeys.privateKey,
    "recipient-key",
  );
  const records: readonly RecordEnvelope[] = [
    { ...signedProposal, occurredAt: "2026-07-18T13:01:00.000Z" },
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
  ];

  assert.throws(() => resolveTimebankRecords(communityId, records), /signature.*invalid|signature/i);
});

test("rejects a transfer whose accepted proposal is absent or whose terms differ", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const transfer = signedTransfer(providerKeys.privateKey, recipientKeys.privateKey, { minutes: 60 });
  const records: readonly RecordEnvelope[] = [
    toLedgerTransferRecord(transfer, { ...metadata, occurredAt: "2026-07-18T13:02:00.000Z" }),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
  ];

  assert.throws(() => resolveTimebankRecords(communityId, records));
  assert.throws(() => resolveTimebankRecords(communityId, [...records, toAcceptedExchangeProposalRecord(proposal(), metadata)]));
});
