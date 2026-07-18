import { type ExchangeProposal, type Listing } from "@peer-hours/timebank-domain";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
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

/** The immutable record kind used to distribute attested ledger transfers. */
export const LEDGER_TRANSFER_RECORD_KIND = "peer-hours/ledger-transfer/v1";

/** A normalized record envelope carrying one published member-owned listing. */
export type PublishedListingRecord = RecordEnvelope<JsonObject>;

/** A normalized record envelope carrying one immutable accepted exchange proposal. */
export type AcceptedExchangeProposalRecord = RecordEnvelope<JsonObject>;
/** A normalized record envelope carrying one proposed exchange awaiting the other participant. */
export type ProposedExchangeProposalRecord = RecordEnvelope<JsonObject>;

/** A normalized record envelope carrying one immutable dual-attested ledger transfer. */
export type LedgerTransferRecord = RecordEnvelope<JsonObject>;

/** Immutable transport metadata supplied when an application creates a timebank record. */
export interface CreateTimebankRecordMetadata {
  readonly occurredAt: string;
  readonly authorId: string;
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
  return proposal;
}

/** Decodes one accepted-proposal envelope after checking its kind and community ownership. */
export function decodeAcceptedExchangeProposalRecord(record: unknown): ExchangeProposal {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND, "accepted exchange proposal");
  const proposal = normalizeAcceptedProposal(normalizedRecord.payload);
  assertProposalEnvelopeMatchesPayload(normalizedRecord, proposal, "accepted");
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

/** Decodes one transfer envelope after checking its kind, community ownership, and attestations. */
export function decodeLedgerTransferRecord(record: unknown): Transfer {
  const normalizedRecord = normalizeRecord(record);
  assertTimebankEnvelope(normalizedRecord);
  assertRecordKind(normalizedRecord, LEDGER_TRANSFER_RECORD_KIND, "ledger transfer");
  const transfer = normalizeTransfer(normalizedRecord.payload);
  assertEnvelopeMatchesPayload(normalizedRecord, transfer.id, transfer.communityId, "ledger transfer");
  return transfer;
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

/**
 * Derives a lifecycle-specific transport identity so a pending proposal and its later
 * acceptance can coexist in the append-only record history without sharing an envelope id.
 */
function proposalRecordId(proposalId: string, lifecycle: "proposed" | "accepted"): string {
  return `${proposalId}/${lifecycle}`;
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
