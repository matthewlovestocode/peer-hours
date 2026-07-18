import { type ExchangeProposal, type Listing } from "@peer-hours/timebank-domain";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import {
  createDualConfirmedSettlementTransfer,
  settlementAcknowledgementId,
  settlementTransferAttestationId,
  type SettlementAcknowledgement,
  type SettlementTransferAttestation,
} from "@peer-hours/timebank-settlement";
import { createRecordEnvelope, type JsonObject, type RecordEnvelope } from "./envelope.js";

/** The envelope schema shared by immutable Peer Hours timebank records. */
export const TIMEBANK_RECORD_SCHEMA = "peer-hours/timebank-record/v1";

/** The current immutable envelope schema version for timebank records. */
export const TIMEBANK_RECORD_VERSION = 1;

/** The immutable record kind used to distribute accepted exchange proposals. */
export const ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND = "peer-hours/accepted-exchange-proposal/v1";

/** The immutable record kind used to distribute a participant-created proposal awaiting acceptance. */
export const PROPOSED_EXCHANGE_PROPOSAL_RECORD_KIND = "peer-hours/proposed-exchange-proposal/v1";

/** The immutable record kind used to distribute member-published offers and requests. */
export const PUBLISHED_LISTING_RECORD_KIND = "peer-hours/published-listing/v1";

/** The immutable record kind used when a listing owner withdraws a published listing. */
export const CLOSED_LISTING_RECORD_KIND = "peer-hours/closed-listing/v1";

/** The immutable record kind used to distribute attested ledger transfers. */
export const LEDGER_TRANSFER_RECORD_KIND = "peer-hours/ledger-transfer/v1";

/** The immutable record kind used to distribute one participant's settlement acknowledgement. */
export const SETTLEMENT_ACKNOWLEDGEMENT_RECORD_KIND = "peer-hours/settlement-acknowledgement/v1";

/** The immutable record kind used to distribute one participant transfer attestation. */
export const SETTLEMENT_TRANSFER_ATTESTATION_RECORD_KIND = "peer-hours/settlement-transfer-attestation/v1";

/** A normalized record envelope carrying one published member-owned listing. */
export type PublishedListingRecord = RecordEnvelope<JsonObject>;

/** The immutable public fact that an owner closed one of their published listings. */
export interface ClosedListing {
  readonly id: string;
  readonly communityId: string;
  readonly listingId: string;
  readonly memberId: string;
}

/** A normalized record envelope carrying one owner-authored listing closure. */
export type ClosedListingRecord = RecordEnvelope<JsonObject>;

/** A normalized record envelope carrying one immutable accepted exchange proposal. */
export type AcceptedExchangeProposalRecord = RecordEnvelope<JsonObject>;
/** A normalized record envelope carrying one proposed exchange awaiting the other participant. */
export type ProposedExchangeProposalRecord = RecordEnvelope<JsonObject>;

/** A normalized record envelope carrying one immutable dual-attested ledger transfer. */
export type LedgerTransferRecord = RecordEnvelope<JsonObject>;

/** A normalized record envelope carrying one participant-owned settlement acknowledgement. */
export type SettlementAcknowledgementRecord = RecordEnvelope<JsonObject>;

/** A normalized record envelope carrying one participant-owned settlement transfer attestation. */
export type SettlementTransferAttestationRecord = RecordEnvelope<JsonObject>;

/** Immutable transport metadata supplied when an application creates a timebank record. */
export interface CreateTimebankRecordMetadata {
  readonly occurredAt: string;
  readonly authorId: string;
}

/** Input needed to encode a dual-confirmed settlement transfer for member-feed publication. */
export interface CreateDualConfirmedSettlementTransferRecordInput {
  /** Accepted proposal whose terms define the transfer. */
  readonly proposal: ExchangeProposal;
  /** Both signed participant acknowledgements resolved from member feeds. */
  readonly acknowledgements: readonly SettlementAcknowledgement[];
  /** The two participant attestations over the deterministic ledger transfer terms. */
  readonly attestations: Transfer["attestations"];
  /** Immutable envelope metadata supplied by the publishing participant. */
  readonly metadata: CreateTimebankRecordMetadata;
}

/** Raised when a replicated record cannot safely map to its timebank domain value. */
export class RecordMappingError extends Error {
  /** Creates a readable mapping-boundary error. */
  constructor(message: string) {
    super(message);
    this.name = "RecordMappingError";
  }
}

/** Encodes a published member offer or request in its immutable community record envelope. */
export function toPublishedListingRecord(
  listing: Listing,
  metadata: CreateTimebankRecordMetadata,
): PublishedListingRecord {
  const normalized = normalizePublishedListing(listing);
  if (metadata.authorId !== normalized.memberId) {
    throw new RecordMappingError("A published listing record must be authored by its member owner.");
  }
  return createRecordEnvelope({
    id: normalized.id,
    schema: TIMEBANK_RECORD_SCHEMA,
    version: TIMEBANK_RECORD_VERSION,
    communityId: normalized.communityId,
    kind: PUBLISHED_LISTING_RECORD_KIND,
    occurredAt: metadata.occurredAt,
    authorId: metadata.authorId,
    payload: normalized as unknown as JsonObject,
  });
}

/** Decodes one published-listing envelope after checking its kind and community ownership. */
export function decodePublishedListingRecord(record: unknown): Listing {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, PUBLISHED_LISTING_RECORD_KIND, "published listing");
  const listing = normalizePublishedListing(normalizedRecord.payload);
  assertEnvelopeMatchesPayload(normalizedRecord, listing.id, listing.communityId, "published listing");
  assertRecordAuthor(normalizedRecord, listing.memberId, "published listing");
  return listing;
}

/** Reduces one community's unordered listing records into unique published offers and requests. */
export function reducePublishedListingRecords(
  records: readonly unknown[],
  communityId: string,
): readonly Listing[] {
  assertText(communityId, "Community id");
  return reduceRecords(records, communityId, decodePublishedListingRecord, "published listing");
}

/** Encodes an owner-authored immutable closure for one already published listing. */
export function toClosedListingRecord(listing: Listing, metadata: CreateTimebankRecordMetadata): ClosedListingRecord {
  const normalized = normalizePublishedListing(listing);
  if (metadata.authorId !== normalized.memberId) {
    throw new RecordMappingError("A closed listing record must be authored by its member owner.");
  }
  const closure: ClosedListing = Object.freeze({
    id: closedListingRecordId(normalized.id),
    communityId: normalized.communityId,
    listingId: normalized.id,
    memberId: normalized.memberId,
  });
  return createRecordEnvelope({
    id: closure.id,
    schema: TIMEBANK_RECORD_SCHEMA,
    version: TIMEBANK_RECORD_VERSION,
    communityId: closure.communityId,
    kind: CLOSED_LISTING_RECORD_KIND,
    occurredAt: metadata.occurredAt,
    authorId: metadata.authorId,
    payload: closure as unknown as JsonObject,
  });
}

/** Decodes one immutable listing closure without deciding whether its referenced listing exists. */
export function decodeClosedListingRecord(record: unknown): ClosedListing {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, CLOSED_LISTING_RECORD_KIND, "closed listing");
  const closure = normalizeClosedListing(normalizedRecord.payload);
  assertEnvelopeMatchesPayload(normalizedRecord, closure.id, closure.communityId, "closed listing");
  assertRecordAuthor(normalizedRecord, closure.memberId, "closed listing");
  return closure;
}

/** Reduces immutable listing closures by their deterministic listing-specific record identity. */
export function reduceClosedListingRecords(records: readonly unknown[], communityId: string): readonly ClosedListing[] {
  assertText(communityId, "Community id");
  return reduceRecords(records, communityId, decodeClosedListingRecord, "closed listing");
}

/** Encodes an accepted exchange proposal in its immutable community record envelope. */
export function toAcceptedExchangeProposalRecord(
  proposal: ExchangeProposal,
  metadata: CreateTimebankRecordMetadata,
): AcceptedExchangeProposalRecord {
  const normalized = normalizeAcceptedProposal(proposal);
  if (metadata.authorId !== normalized.acceptedByMemberId) {
    throw new RecordMappingError("An accepted proposal record must be authored by the member who accepted it.");
  }
  return createRecordEnvelope({
    id: proposalRecordId(normalized.id, "accepted"),
    schema: TIMEBANK_RECORD_SCHEMA,
    version: TIMEBANK_RECORD_VERSION,
    communityId: normalized.communityId,
    kind: ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND,
    occurredAt: metadata.occurredAt,
    authorId: metadata.authorId,
    payload: normalized as unknown as JsonObject,
  });
}

/** Encodes a proposed exchange only when the proposal creator authors its immutable record. */
export function toProposedExchangeProposalRecord(proposal: ExchangeProposal, metadata: CreateTimebankRecordMetadata): ProposedExchangeProposalRecord {
  const normalized = normalizeProposedProposal(proposal);
  if (metadata.authorId !== normalized.creatorMemberId) throw new RecordMappingError("A proposed exchange record must be authored by its creator.");
  return createRecordEnvelope({ id: proposalRecordId(normalized.id, "proposed"), schema: TIMEBANK_RECORD_SCHEMA, version: TIMEBANK_RECORD_VERSION, communityId: normalized.communityId, kind: PROPOSED_EXCHANGE_PROPOSAL_RECORD_KIND, occurredAt: metadata.occurredAt, authorId: metadata.authorId, payload: normalized as unknown as JsonObject });
}

/** Decodes a proposed exchange only when its immutable terms still describe a pending proposal. */
export function decodeProposedExchangeProposalRecord(record: unknown): ExchangeProposal {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, PROPOSED_EXCHANGE_PROPOSAL_RECORD_KIND, "proposed exchange proposal");
  const proposal = normalizeProposedProposal(normalizedRecord.payload);
  assertProposalEnvelopeMatchesPayload(normalizedRecord, proposal, "proposed");
  assertRecordAuthor(normalizedRecord, proposal.creatorMemberId, "proposed exchange proposal");
  return proposal;
}

/** Decodes one accepted-proposal envelope after checking its kind and community ownership. */
export function decodeAcceptedExchangeProposalRecord(record: unknown): ExchangeProposal {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND, "accepted exchange proposal");
  const proposal = normalizeAcceptedProposal(normalizedRecord.payload);
  assertProposalEnvelopeMatchesPayload(normalizedRecord, proposal, "accepted");
  if (normalizedRecord.authorId !== proposal.acceptedByMemberId) {
    throw new RecordMappingError("A proposal record must be signed by the member who accepted it.");
  }
  return proposal;
}

/** Encodes a ledger transfer, including both immutable participant attestations, in its record envelope. */
export function toLedgerTransferRecord(transfer: Transfer, metadata: CreateTimebankRecordMetadata): LedgerTransferRecord {
  const normalized = normalizeTransfer(transfer);
  return createRecordEnvelope({
    id: normalized.id,
    schema: TIMEBANK_RECORD_SCHEMA,
    version: TIMEBANK_RECORD_VERSION,
    communityId: normalized.communityId,
    kind: LEDGER_TRANSFER_RECORD_KIND,
    occurredAt: metadata.occurredAt,
    authorId: metadata.authorId,
    payload: normalized as unknown as JsonObject,
  });
}

/**
 * Encodes a normal settlement only after the accepted proposal and both participant
 * acknowledgements compose one deterministic, dual-attested transfer.
 *
 * This encoder intentionally does not mark the transfer final: signature verification and the
 * community's replication acknowledgement policy remain resolver and application concerns.
 */
export function toDualConfirmedSettlementTransferRecord(
  input: CreateDualConfirmedSettlementTransferRecordInput,
): LedgerTransferRecord {
  const transfer = createDualConfirmedSettlementTransfer({
    proposal: input.proposal,
    acknowledgements: input.acknowledgements,
    attestations: input.attestations,
  });
  if (
    input.metadata.authorId !== transfer.providerMemberId &&
    input.metadata.authorId !== transfer.recipientMemberId
  ) {
    throw new RecordMappingError("A settlement transfer record must be authored by one of its participants.");
  }
  return toLedgerTransferRecord(transfer, input.metadata);
}

/** Decodes one transfer envelope after checking its kind, community ownership, and attestations. */
export function decodeLedgerTransferRecord(record: unknown): Transfer {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, LEDGER_TRANSFER_RECORD_KIND, "ledger transfer");
  const transfer = normalizeTransfer(normalizedRecord.payload);
  assertEnvelopeMatchesPayload(normalizedRecord, transfer.id, transfer.communityId, "ledger transfer");
  if (normalizedRecord.authorId !== transfer.providerMemberId && normalizedRecord.authorId !== transfer.recipientMemberId) {
    throw new RecordMappingError("A ledger transfer record must be submitted by one of its participants.");
  }
  return transfer;
}

/** Encodes one participant-owned acknowledgement of an accepted exchange's exact terms. */
export function toSettlementAcknowledgementRecord(
  acknowledgement: SettlementAcknowledgement,
  metadata: CreateTimebankRecordMetadata,
): SettlementAcknowledgementRecord {
  const normalized = normalizeSettlementAcknowledgement(acknowledgement);
  if (metadata.authorId !== normalized.acknowledgedByMemberId) {
    throw new RecordMappingError("A settlement acknowledgement record must be authored by its acknowledging participant.");
  }
  return createRecordEnvelope({
    id: normalized.id,
    schema: TIMEBANK_RECORD_SCHEMA,
    version: TIMEBANK_RECORD_VERSION,
    communityId: normalized.communityId,
    kind: SETTLEMENT_ACKNOWLEDGEMENT_RECORD_KIND,
    occurredAt: metadata.occurredAt,
    authorId: metadata.authorId,
    payload: normalized as unknown as JsonObject,
  });
}

/** Decodes a structurally valid settlement acknowledgement; proposal linkage is resolved separately. */
export function decodeSettlementAcknowledgementRecord(record: unknown): SettlementAcknowledgement {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, SETTLEMENT_ACKNOWLEDGEMENT_RECORD_KIND, "settlement acknowledgement");
  const acknowledgement = normalizeSettlementAcknowledgement(normalizedRecord.payload);
  assertEnvelopeMatchesPayload(
    normalizedRecord,
    acknowledgement.id,
    acknowledgement.communityId,
    "settlement acknowledgement",
  );
  assertRecordAuthor(
    normalizedRecord,
    acknowledgement.acknowledgedByMemberId,
    "settlement acknowledgement",
  );
  return acknowledgement;
}

/** Encodes one participant-owned signature over deterministic, dual-confirmed settlement terms. */
export function toSettlementTransferAttestationRecord(
  settlementAttestation: SettlementTransferAttestation,
  metadata: CreateTimebankRecordMetadata,
): SettlementTransferAttestationRecord {
  const normalized = normalizeSettlementTransferAttestation(settlementAttestation);
  if (metadata.authorId !== normalized.attestation.memberId) {
    throw new RecordMappingError("A settlement transfer attestation record must be authored by its attesting participant.");
  }
  return createRecordEnvelope({
    id: normalized.id,
    schema: TIMEBANK_RECORD_SCHEMA,
    version: TIMEBANK_RECORD_VERSION,
    communityId: normalized.communityId,
    kind: SETTLEMENT_TRANSFER_ATTESTATION_RECORD_KIND,
    occurredAt: metadata.occurredAt,
    authorId: metadata.authorId,
    payload: normalized as unknown as JsonObject,
  });
}

/** Decodes a structurally valid settlement attestation; proposal linkage is resolved separately. */
export function decodeSettlementTransferAttestationRecord(record: unknown): SettlementTransferAttestation {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, SETTLEMENT_TRANSFER_ATTESTATION_RECORD_KIND, "settlement transfer attestation");
  const settlementAttestation = normalizeSettlementTransferAttestation(normalizedRecord.payload);
  assertEnvelopeMatchesPayload(normalizedRecord, settlementAttestation.id, settlementAttestation.communityId, "settlement transfer attestation");
  assertRecordAuthor(normalizedRecord, settlementAttestation.attestation.memberId, "settlement transfer attestation");
  return settlementAttestation;
}

/** Reduces one community's unordered proposal records into unique immutable accepted proposals. */
export function reduceAcceptedExchangeProposalRecords(
  records: readonly unknown[],
  communityId: string,
): readonly ExchangeProposal[] {
  assertText(communityId, "Community id");
  return reduceRecords(records, communityId, decodeAcceptedExchangeProposalRecord, "accepted exchange proposal");
}

/** Reduces one community's unordered pending proposal records into unique immutable proposals. */
export function reduceProposedExchangeProposalRecords(records: readonly unknown[], communityId: string): readonly ExchangeProposal[] {
  assertText(communityId, "Community id");
  return reduceRecords(records, communityId, decodeProposedExchangeProposalRecord, "proposed exchange proposal");
}

/** Reduces one community's unordered transfer records into unique immutable attested transfers. */
export function reduceLedgerTransferRecords(
  records: readonly unknown[],
  communityId: string,
): readonly Transfer[] {
  assertText(communityId, "Community id");
  return reduceRecords(records, communityId, decodeLedgerTransferRecord, "ledger transfer");
}

/** Reduces one community's immutable settlement acknowledgements by their participant-specific identity. */
export function reduceSettlementAcknowledgementRecords(
  records: readonly unknown[],
  communityId: string,
): readonly SettlementAcknowledgement[] {
  assertText(communityId, "Community id");
  return reduceRecords(records, communityId, decodeSettlementAcknowledgementRecord, "settlement acknowledgement");
}

/** Reduces one community's participant attestations by their proposal-and-member identity. */
export function reduceSettlementTransferAttestationRecords(
  records: readonly unknown[],
  communityId: string,
): readonly SettlementTransferAttestation[] {
  assertText(communityId, "Community id");
  return reduceRecords(records, communityId, decodeSettlementTransferAttestationRecord, "settlement transfer attestation");
}

/** Normalizes and validates the immutable accepted-proposal form permitted in replicated records. */
function normalizeAcceptedProposal(value: unknown): ExchangeProposal {
  if (!isRecord(value)) throw new RecordMappingError("An accepted exchange proposal payload must be an object.");

  const proposal = value as Partial<ExchangeProposal>;
  assertText(proposal.id, "Proposal id");
  assertText(proposal.communityId, "Proposal community id");
  assertText(proposal.offerId, "Proposal offer id");
  assertText(proposal.requestId, "Proposal request id");
  assertText(proposal.providerMemberId, "Proposal provider member id");
  assertText(proposal.receiverMemberId, "Proposal receiver member id");
  assertText(proposal.creatorMemberId, "Proposal creator member id");
  assertText(proposal.acceptedByMemberId, "Proposal accepting member id");
  if (proposal.status !== "accepted") throw new RecordMappingError("A proposal record must contain an accepted proposal.");
  assertMinutes(proposal.minutes, "Proposal minutes");
  if (proposal.providerMemberId === proposal.receiverMemberId) {
    throw new RecordMappingError("An accepted proposal requires distinct provider and recipient members.");
  }
  if (proposal.creatorMemberId !== proposal.providerMemberId && proposal.creatorMemberId !== proposal.receiverMemberId) {
    throw new RecordMappingError("An accepted proposal must be created by one of its participants.");
  }
  const expectedAcceptor = proposal.creatorMemberId === proposal.providerMemberId
    ? proposal.receiverMemberId
    : proposal.providerMemberId;
  if (proposal.acceptedByMemberId !== expectedAcceptor) {
    throw new RecordMappingError("An accepted proposal must be accepted by the other participant.");
  }

  return Object.freeze({
    id: proposal.id,
    communityId: proposal.communityId,
    offerId: proposal.offerId,
    requestId: proposal.requestId,
    providerMemberId: proposal.providerMemberId,
    receiverMemberId: proposal.receiverMemberId,
    creatorMemberId: proposal.creatorMemberId,
    acceptedByMemberId: proposal.acceptedByMemberId,
    minutes: proposal.minutes,
    status: "accepted",
  });
}

/** Normalizes the pending proposal form that may be replicated before another member accepts it. */
function normalizeProposedProposal(value: unknown): ExchangeProposal {
  if (!isRecord(value)) throw new RecordMappingError("A proposed exchange proposal payload must be an object.");
  const proposal = value as Partial<ExchangeProposal>;
  assertText(proposal.id, "Proposal id"); assertText(proposal.communityId, "Proposal community id"); assertText(proposal.offerId, "Proposal offer id"); assertText(proposal.requestId, "Proposal request id"); assertText(proposal.providerMemberId, "Proposal provider member id"); assertText(proposal.receiverMemberId, "Proposal receiver member id"); assertText(proposal.creatorMemberId, "Proposal creator member id");
  if (proposal.status !== "proposed" || proposal.acceptedByMemberId !== undefined) throw new RecordMappingError("A proposal record must contain an unaccepted proposal.");
  assertMinutes(proposal.minutes, "Proposal minutes");
  if (proposal.providerMemberId === proposal.receiverMemberId || (proposal.creatorMemberId !== proposal.providerMemberId && proposal.creatorMemberId !== proposal.receiverMemberId)) throw new RecordMappingError("A proposed exchange requires a participating creator and distinct members.");
  return Object.freeze({ id: proposal.id, communityId: proposal.communityId, offerId: proposal.offerId, requestId: proposal.requestId, providerMemberId: proposal.providerMemberId, receiverMemberId: proposal.receiverMemberId, creatorMemberId: proposal.creatorMemberId, minutes: proposal.minutes, status: "proposed" });
}

/** Normalizes only the immutable published listing shape that is safe to replicate publicly. */
function normalizePublishedListing(value: unknown): Listing {
  if (!isRecord(value)) throw new RecordMappingError("A published listing payload must be an object.");

  const listing = value as Partial<Listing>;
  assertText(listing.id, "Listing id");
  assertText(listing.communityId, "Listing community id");
  assertText(listing.memberId, "Listing member id");
  assertText(listing.title, "Listing title");
  assertMinutes(listing.minutes, "Listing minutes");
  if (listing.kind !== "offer" && listing.kind !== "request") {
    throw new RecordMappingError("A published listing must be an offer or request.");
  }
  if (listing.status !== "published") {
    throw new RecordMappingError("A replicated listing record must contain a published listing.");
  }

  return Object.freeze({
    id: listing.id,
    communityId: listing.communityId,
    memberId: listing.memberId,
    kind: listing.kind,
    title: listing.title,
    minutes: listing.minutes,
    status: "published",
  });
}

/** Normalizes the minimal immutable closure fact while deferring listing linkage to resolution. */
function normalizeClosedListing(value: unknown): ClosedListing {
  if (!isRecord(value)) throw new RecordMappingError("A closed listing payload must be an object.");
  const closure = value as Partial<ClosedListing>;
  assertText(closure.id, "Closed listing id");
  assertText(closure.communityId, "Closed listing community id");
  assertText(closure.listingId, "Closed listing target id");
  assertText(closure.memberId, "Closed listing member id");
  if (closure.id !== closedListingRecordId(closure.listingId)) {
    throw new RecordMappingError("A closed listing record id must name its target listing.");
  }
  return Object.freeze({ id: closure.id, communityId: closure.communityId, listingId: closure.listingId, memberId: closure.memberId });
}

/** Normalizes a transfer through the ledger contract while converting malformed input to a record error. */
function normalizeTransfer(value: unknown): Transfer {
  if (!isRecord(value)) throw new RecordMappingError("A ledger transfer payload must be an object.");
  try {
    return createTransfer(value as unknown as Transfer);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid transfer.";
    throw new RecordMappingError(`Invalid ledger transfer payload: ${detail}`);
  }
}

/** Normalizes acknowledgement shape before proposal-specific rules run during resolution. */
function normalizeSettlementAcknowledgement(value: unknown): SettlementAcknowledgement {
  if (!isRecord(value)) throw new RecordMappingError("A settlement acknowledgement payload must be an object.");
  const acknowledgement = value as Partial<SettlementAcknowledgement>;
  assertText(acknowledgement.id, "Settlement acknowledgement id");
  assertText(acknowledgement.communityId, "Settlement acknowledgement community id");
  assertText(acknowledgement.sourceProposalId, "Settlement acknowledgement source proposal id");
  assertText(acknowledgement.providerMemberId, "Settlement acknowledgement provider member id");
  assertText(acknowledgement.recipientMemberId, "Settlement acknowledgement recipient member id");
  assertText(acknowledgement.acknowledgedByMemberId, "Settlement acknowledgement member id");
  assertMinutes(acknowledgement.minutes, "Settlement acknowledgement minutes");
  if (acknowledgement.providerMemberId === acknowledgement.recipientMemberId) {
    throw new RecordMappingError("A settlement acknowledgement requires distinct provider and recipient members.");
  }
  if (
    acknowledgement.acknowledgedByMemberId !== acknowledgement.providerMemberId &&
    acknowledgement.acknowledgedByMemberId !== acknowledgement.recipientMemberId
  ) {
    throw new RecordMappingError("Only an exchange participant may acknowledge a settlement.");
  }
  if (
    acknowledgement.id !== settlementAcknowledgementId(
      acknowledgement.sourceProposalId,
      acknowledgement.acknowledgedByMemberId,
    )
  ) {
    throw new RecordMappingError("A settlement acknowledgement record id must name its proposal and acknowledging participant.");
  }
  return Object.freeze({
    id: acknowledgement.id,
    communityId: acknowledgement.communityId,
    sourceProposalId: acknowledgement.sourceProposalId,
    providerMemberId: acknowledgement.providerMemberId,
    recipientMemberId: acknowledgement.recipientMemberId,
    minutes: acknowledgement.minutes,
    acknowledgedByMemberId: acknowledgement.acknowledgedByMemberId,
  });
}

/** Validates public attestation container shape before proposal-specific resolution checks. */
function normalizeSettlementTransferAttestation(value: unknown): SettlementTransferAttestation {
  if (!isRecord(value)) throw new RecordMappingError("A settlement transfer attestation payload must be an object.");
  const source = value as Partial<SettlementTransferAttestation>;
  assertText(source.id, "Settlement transfer attestation id");
  assertText(source.communityId, "Settlement transfer attestation community id");
  assertText(source.sourceProposalId, "Settlement transfer attestation source proposal id");
  if (!isRecord(source.attestation)) throw new RecordMappingError("A settlement transfer attestation requires an attestation object.");
  const attestation = source.attestation as Partial<SettlementTransferAttestation["attestation"]>;
  assertText(attestation.memberId, "Settlement transfer attesting member id");
  assertText(attestation.keyId, "Settlement transfer attestation key id");
  assertText(attestation.payloadDigest, "Settlement transfer attestation payload digest");
  assertText(attestation.signature, "Settlement transfer attestation signature");
  if (source.id !== settlementTransferAttestationId(source.sourceProposalId, attestation.memberId)) {
    throw new RecordMappingError("A settlement transfer attestation record id must name its proposal and attesting participant.");
  }
  return Object.freeze({
    id: source.id,
    communityId: source.communityId,
    sourceProposalId: source.sourceProposalId,
    attestation: Object.freeze({
      memberId: attestation.memberId,
      keyId: attestation.keyId,
      payloadDigest: attestation.payloadDigest,
      signature: attestation.signature,
    }),
  });
}

/** Re-validates unknown replicated input through the generic immutable envelope boundary. */
function normalizeRecord(value: unknown): RecordEnvelope {
  if (!isRecord(value)) throw new RecordMappingError("A timebank record envelope must be an object.");
  try {
    return createRecordEnvelope(value as unknown as RecordEnvelope);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid record envelope.";
    throw new RecordMappingError(`Invalid timebank record envelope: ${detail}`);
  }
}

/** Ensures the typed envelope has the immutable record kind expected by a decoder. */
function assertTimebankEnvelope(record: RecordEnvelope): void {
  if (record.schema !== TIMEBANK_RECORD_SCHEMA || record.version !== TIMEBANK_RECORD_VERSION) {
    throw new RecordMappingError("A timebank record must use the current Peer Hours timebank envelope schema.");
  }
}

/** Ensures the typed envelope has the immutable record kind expected by a decoder. */
function assertRecordKind(record: RecordEnvelope, kind: string, label: string): void {
  if (record.kind !== kind) throw new RecordMappingError(`A ${label} record must use kind ${kind}.`);
}

/** Ensures immutable entity identity and community ownership agree with their transport envelope. */
function assertEnvelopeMatchesPayload(
  record: RecordEnvelope,
  payloadId: string,
  payloadCommunityId: string,
  label: string,
): void {
  if (record.id !== payloadId) throw new RecordMappingError(`A ${label} record id must match its payload id.`);
  if (record.communityId !== payloadCommunityId) {
    throw new RecordMappingError(`A ${label} record community must match its payload community.`);
  }
}

/** Ensures a member-owned record retains the author identity mandated by its domain payload. */
function assertRecordAuthor(record: RecordEnvelope, expectedAuthorId: string, label: string): void {
  if (record.authorId !== expectedAuthorId) {
    throw new RecordMappingError(`A ${label} record must be authored by its payload owner.`);
  }
}

/**
 * Derives a lifecycle-specific transport identity so a pending proposal and its later
 * acceptance can coexist in the append-only record history without sharing an envelope id.
 */
function proposalRecordId(proposalId: string, lifecycle: "proposed" | "accepted"): string {
  return `${proposalId}/${lifecycle}`;
}

/** Derives the one deterministic immutable closure-record identity for a listing. */
function closedListingRecordId(listingId: string): string {
  return `${listingId}/closed`;
}

/** Ensures a lifecycle-specific proposal envelope still names the exact domain proposal and community. */
function assertProposalEnvelopeMatchesPayload(
  record: RecordEnvelope,
  proposal: ExchangeProposal,
  lifecycle: "proposed" | "accepted",
): void {
  if (record.id !== proposalRecordId(proposal.id, lifecycle)) {
    throw new RecordMappingError(`A ${lifecycle} exchange proposal record id must match its lifecycle-specific payload id.`);
  }
  if (record.communityId !== proposal.communityId) {
    throw new RecordMappingError(`A ${lifecycle} exchange proposal record community must match its payload community.`);
  }
}

/** Dedupe-reduces immutable records while rejecting same-id records carrying different content. */
function reduceRecords<T extends { readonly id: string; readonly communityId: string }>(
  records: readonly unknown[],
  communityId: string,
  decode: (record: unknown) => T,
  label: string,
): readonly T[] {
  const valuesById = new Map<string, T>();
  for (const record of records) {
    const value = decode(record);
    if (value.communityId !== communityId) {
      throw new RecordMappingError(`A ${label} record belongs to a different community.`);
    }
    const existing = valuesById.get(value.id);
    if (existing !== undefined && stableJson(existing) !== stableJson(value)) {
      throw new RecordMappingError(`Conflicting ${label} records share the same id.`);
    }
    valuesById.set(value.id, value);
  }
  return Object.freeze([...valuesById.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

/** Provides the fixed normalized object representation used only for conflict detection. */
function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Narrows unknown transport data to a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Requires a non-empty text term at the record boundary. */
function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RecordMappingError(`${label} is required.`);
  }
}

/** Requires a positive whole-minute amount at the record boundary. */
function assertMinutes(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new RecordMappingError(`${label} must be a positive whole number.`);
  }
}
