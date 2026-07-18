import assert from "node:assert/strict";
import test from "node:test";
import { createSettlementAcknowledgement } from "@peer-hours/timebank-settlement";
import { createRecordEnvelope } from "../src/envelope.js";
import {
  ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND,
  PROPOSED_EXCHANGE_PROPOSAL_RECORD_KIND,
  LEDGER_TRANSFER_RECORD_KIND,
  RecordMappingError,
  decodeAcceptedExchangeProposalRecord,
  decodeLedgerTransferRecord,
  reduceAcceptedExchangeProposalRecords,
  reduceLedgerTransferRecords,
  reduceProposedExchangeProposalRecords,
  toAcceptedExchangeProposalRecord,
  toProposedExchangeProposalRecord,
  decodeProposedExchangeProposalRecord,
  toLedgerTransferRecord,
  toDualConfirmedSettlementTransferRecord,
  decodePublishedListingRecord,
  decodeSettlementAcknowledgementRecord,
  toPublishedListingRecord,
  toSettlementAcknowledgementRecord,
} from "../src/timebank-records.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const otherCommunityId = "peer-hours/earth/US/CA/san-francisco";
const recordMetadata = { occurredAt: "2026-07-18T08:00:00.000Z", authorId: "member-provider" };
const acceptedProposalMetadata = { ...recordMetadata, authorId: "member-recipient" };

/** Creates one generic envelope using the fixed timebank mapping schema metadata. */
function envelope(input: { readonly id: string; readonly communityId: string; readonly kind: string; readonly payload: object }) {
  return createRecordEnvelope({
    ...input,
    schema: "peer-hours/timebank-record/v1",
    version: 1,
    ...recordMetadata,
  });
}

/** Creates an immutable accepted exchange proposal fixture. */
function acceptedProposal(id = "proposal-1") {
  return {
    id,
    communityId,
    offerId: "offer-1",
    requestId: "request-1",
    providerMemberId: "member-provider",
    receiverMemberId: "member-recipient",
    creatorMemberId: "member-provider",
    acceptedByMemberId: "member-recipient",
    minutes: 60,
    status: "accepted" as const,
  };
}

/** Creates a structurally valid ledger transfer fixture with both participant attestations. */
function transfer(id = "transfer-1") {
  return {
    id,
    communityId,
    sourceProposalId: "proposal-1",
    providerMemberId: "member-provider",
    recipientMemberId: "member-recipient",
    minutes: 60,
    attestations: [
      { memberId: "member-provider", keyId: "provider-key", payloadDigest: "digest", signature: "provider-signature" },
      { memberId: "member-recipient", keyId: "recipient-key", payloadDigest: "digest", signature: "recipient-signature" },
    ],
  };
}

/** Creates a published listing fixture owned by the provider member. */
function publishedListing() {
  return {
    id: "listing-1",
    communityId,
    memberId: "member-provider",
    kind: "offer" as const,
    title: "Garden help",
    minutes: 60,
    status: "published" as const,
  };
}

test("maps and decodes an immutable accepted exchange proposal", () => {
  const record = toAcceptedExchangeProposalRecord(acceptedProposal(), acceptedProposalMetadata);

  assert.equal(record.kind, ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND);
  assert.equal(record.communityId, communityId);
  assert.deepEqual(decodeAcceptedExchangeProposalRecord(record), acceptedProposal());
});

test("maps a pending proposal only when its creator authors the record", () => {
  const { acceptedByMemberId: _acceptedByMemberId, ...proposal } = { ...acceptedProposal(), status: "proposed" as const };
  const record = toProposedExchangeProposalRecord(proposal, recordMetadata);
  assert.equal(record.kind, PROPOSED_EXCHANGE_PROPOSAL_RECORD_KIND);
  assert.deepEqual(decodeProposedExchangeProposalRecord(record), proposal);
  assert.throws(() => toProposedExchangeProposalRecord(proposal, acceptedProposalMetadata), /authored by its creator/i);
});

test("rejects pending proposals that contain acceptance data or an invalid creator", () => {
  const { acceptedByMemberId: _acceptedByMemberId, ...pending } = {
    ...acceptedProposal(),
    status: "proposed" as const,
  };

  assert.throws(
    () => toProposedExchangeProposalRecord({ ...pending, acceptedByMemberId: "member-recipient" }, recordMetadata),
    /unaccepted proposal/i,
  );
  assert.throws(
    () => toProposedExchangeProposalRecord({ ...pending, creatorMemberId: "member-observer" }, recordMetadata),
    /participating creator/i,
  );
});

test("reduces pending proposal replays and rejects conflicting or cross-community pending records", () => {
  const { acceptedByMemberId: _acceptedByMemberId, ...pending } = {
    ...acceptedProposal(),
    status: "proposed" as const,
  };
  const duplicate = toProposedExchangeProposalRecord(pending, recordMetadata);
  const conflict = toProposedExchangeProposalRecord({ ...pending, minutes: 30 }, recordMetadata);
  const crossCommunity = toProposedExchangeProposalRecord(
    { ...pending, id: "proposal-2", communityId: otherCommunityId },
    recordMetadata,
  );

  assert.deepEqual(reduceProposedExchangeProposalRecords([duplicate, duplicate], communityId), [pending]);
  assert.throws(() => reduceProposedExchangeProposalRecords([duplicate, conflict], communityId), RecordMappingError);
  assert.throws(() => reduceProposedExchangeProposalRecords([duplicate, crossCommunity], communityId), RecordMappingError);
});

test("maps and decodes a ledger transfer without losing attestations", () => {
  const expected = transfer();
  const record = toLedgerTransferRecord(expected, recordMetadata);

  assert.equal(record.kind, LEDGER_TRANSFER_RECORD_KIND);
  assert.deepEqual(decodeLedgerTransferRecord(record), expected);
});

test("encodes a deterministic settlement transfer only from dual-confirmed acknowledgements", () => {
  const proposal = acceptedProposal();
  const acknowledgements = [
    createSettlementAcknowledgement(proposal, proposal.providerMemberId),
    createSettlementAcknowledgement(proposal, proposal.receiverMemberId),
  ];
  const record = toDualConfirmedSettlementTransferRecord({
    proposal,
    acknowledgements,
    attestations: transfer().attestations,
    metadata: recordMetadata,
  });

  assert.equal(record.id, "proposal-1/settlement");
  assert.deepEqual(decodeLedgerTransferRecord(record), {
    ...transfer(),
    id: "proposal-1/settlement",
  });
});

test("rejects one-sided settlement publication and non-participant authors", () => {
  const proposal = acceptedProposal();
  const acknowledgement = createSettlementAcknowledgement(proposal, proposal.providerMemberId);
  const input = {
    proposal,
    acknowledgements: [acknowledgement],
    attestations: transfer().attestations,
    metadata: recordMetadata,
  };
  assert.throws(() => toDualConfirmedSettlementTransferRecord(input), /both exchange participants/i);
  assert.throws(
    () => toDualConfirmedSettlementTransferRecord({
      ...input,
      acknowledgements: [
        acknowledgement,
        createSettlementAcknowledgement(proposal, proposal.receiverMemberId),
      ],
      metadata: { ...recordMetadata, authorId: "member-observer" },
    }),
    /authored by one of its participants/i,
  );
});

test("rejects malformed proposal and transfer record payloads", () => {
  const malformedProposal = envelope({
    id: "proposal-1",
    communityId,
    kind: ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND,
    payload: { ...acceptedProposal(), acceptedByMemberId: "" },
  });
  const malformedTransfer = envelope({
    id: "transfer-1",
    communityId,
    kind: LEDGER_TRANSFER_RECORD_KIND,
    payload: { ...transfer(), attestations: [] },
  });

  assert.throws(() => decodeAcceptedExchangeProposalRecord(malformedProposal), RecordMappingError);
  assert.throws(() => decodeLedgerTransferRecord(malformedTransfer), RecordMappingError);
});

test("requires the accepting member to author an accepted proposal record", () => {
  assert.throws(
    () => toAcceptedExchangeProposalRecord(acceptedProposal(), recordMetadata),
    /authored by the member who accepted it/,
  );
});

test("rejects decoded member-owned records whose envelope author does not match their payload owner", () => {
  const accepted = toAcceptedExchangeProposalRecord(acceptedProposal(), acceptedProposalMetadata);
  const { acceptedByMemberId: _acceptedByMemberId, ...proposedProposal } = {
    ...acceptedProposal(),
    status: "proposed" as const,
  };
  const proposed = toProposedExchangeProposalRecord(proposedProposal, recordMetadata);
  const published = toPublishedListingRecord(publishedListing(), recordMetadata);
  const acknowledgement = toSettlementAcknowledgementRecord(
    createSettlementAcknowledgement(acceptedProposal(), "member-provider"),
    recordMetadata,
  );
  const settlement = toLedgerTransferRecord(transfer(), recordMetadata);

  assert.throws(() => decodeAcceptedExchangeProposalRecord({ ...accepted, authorId: "member-provider" }), /accepted it/i);
  assert.throws(() => decodeProposedExchangeProposalRecord({ ...proposed, authorId: "member-recipient" }), /payload owner/i);
  assert.throws(() => decodePublishedListingRecord({ ...published, authorId: "member-recipient" }), /payload owner/i);
  assert.throws(() => decodeSettlementAcknowledgementRecord({ ...acknowledgement, authorId: "member-recipient" }), /payload owner/i);
  assert.throws(() => decodeLedgerTransferRecord({ ...settlement, authorId: "member-observer" }), /submitted by one of its participants/i);
});

test("rejects records whose kind or community does not match their payload", () => {
  const wrongKind = envelope({
    id: "proposal-1",
    communityId,
    kind: LEDGER_TRANSFER_RECORD_KIND,
    payload: acceptedProposal(),
  });
  const crossCommunity = envelope({
    id: "proposal-1",
    communityId: otherCommunityId,
    kind: ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND,
    payload: acceptedProposal(),
  });

  assert.throws(() => decodeAcceptedExchangeProposalRecord(wrongKind), RecordMappingError);
  assert.throws(() => decodeAcceptedExchangeProposalRecord(crossCommunity), RecordMappingError);
});

test("reduces duplicate proposal records and rejects conflicting or cross-community records", () => {
  const proposal = acceptedProposal();
  const duplicate = toAcceptedExchangeProposalRecord(proposal, acceptedProposalMetadata);
  const conflict = toAcceptedExchangeProposalRecord({ ...proposal, minutes: 30 }, acceptedProposalMetadata);
  const crossCommunity = toAcceptedExchangeProposalRecord(
    { ...proposal, id: "proposal-2", communityId: otherCommunityId },
    acceptedProposalMetadata,
  );

  assert.deepEqual(reduceAcceptedExchangeProposalRecords([duplicate, duplicate], communityId), [proposal]);
  assert.throws(() => reduceAcceptedExchangeProposalRecords([duplicate, conflict], communityId), RecordMappingError);
  assert.throws(() => reduceAcceptedExchangeProposalRecords([duplicate, crossCommunity], communityId), RecordMappingError);
});

test("reduces duplicate transfer records, preserves attestations, and rejects conflicts", () => {
  const expected = transfer();
  const duplicate = toLedgerTransferRecord(expected, recordMetadata);
  const conflict = toLedgerTransferRecord({ ...expected, minutes: 30 }, recordMetadata);
  const crossCommunity = toLedgerTransferRecord(
    { ...expected, id: "transfer-2", communityId: otherCommunityId },
    recordMetadata,
  );

  assert.deepEqual(reduceLedgerTransferRecords([duplicate, duplicate], communityId), [expected]);
  assert.throws(() => reduceLedgerTransferRecords([duplicate, conflict], communityId), RecordMappingError);
  assert.throws(() => reduceLedgerTransferRecords([duplicate, crossCommunity], communityId), RecordMappingError);
});
