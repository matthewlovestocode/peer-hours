import { type ExchangeProposal, type Listing } from "@peer-hours/timebank-domain";
import {
  createEd25519SignatureVerifier,
  type MemberSigningKeyAuthorization,
} from "@peer-hours/timebank-identity";
import { applyTransfers, type Ledger, type Transfer } from "@peer-hours/timebank-ledger";
import { validateSettlementTransfer } from "@peer-hours/timebank-settlement";
import { reduceRecordEnvelopes, type RecordEnvelope } from "./envelope.js";
import {
  IDENTITY_KEY_ACTIVATION_RECORD_KIND,
  IDENTITY_KEY_REVOCATION_RECORD_KIND,
  reduceMemberSigningKeyAuthorizationRecords,
} from "./identity-records.js";
import {
  isMemberSignedRecord,
  verifyMemberSignedRecord,
  type MemberSignedRecord,
} from "./member-signed-record.js";
import {
  MEMBER_FEED_DECLARATION_RECORD_KIND,
  memberFeedDeclarationsToAuthorizations,
} from "./self-owned-identity-records.js";
import {
  ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND,
  LEDGER_TRANSFER_RECORD_KIND,
  PUBLISHED_LISTING_RECORD_KIND,
  decodeAcceptedExchangeProposalRecord,
  decodeLedgerTransferRecord,
  decodePublishedListingRecord,
  reduceAcceptedExchangeProposalRecords,
  reduceLedgerTransferRecords,
  reducePublishedListingRecords,
} from "./timebank-records.js";

/** The deterministic local timebank view derived from one replicated record history. */
export interface ResolvedTimebankState {
  readonly communityId: string;
  readonly authorizations: readonly MemberSigningKeyAuthorization[];
  readonly publishedListings: readonly Listing[];
  readonly acceptedProposals: readonly ExchangeProposal[];
  readonly transfers: readonly Transfer[];
  readonly ledger: Ledger;
}

/** Error raised when a record history cannot form one coherent verified timebank state. */
export class RecordResolutionError extends Error {
  /** Creates a readable record-resolution error. */
  constructor(message: string) {
    super(message);
    this.name = "RecordResolutionError";
  }
}

/**
 * Resolves one community's immutable record history into authorizations, accepted proposals,
 * verified transfers, and derived balances.
 *
 * The caller supplies only records. The resolver first removes identical replay, then delegates
 * each rule to its owning package. It deliberately does not trust record authors or establish
 * community authority; that requires a future signed policy protocol.
 */
export function resolveTimebankRecords(
  communityId: string,
  records: readonly (RecordEnvelope | MemberSignedRecord)[],
): ResolvedTimebankState {
  try {
    const normalizedRecords = reduceRecordEnvelopes(records);
    const communityRecords = normalizedRecords.filter((record) => record.communityId === communityId);
    const legacyAuthorizations = reduceMemberSigningKeyAuthorizationRecords(
      communityRecords.filter(isIdentityRecord),
    );
    const selfOwnedAuthorizations = memberFeedDeclarationsToAuthorizations(
      communityRecords.filter((record) => record.kind === MEMBER_FEED_DECLARATION_RECORD_KIND),
    );
    const authorizations = Object.freeze([...legacyAuthorizations, ...selfOwnedAuthorizations]);
    assertMemberSignedDomainRecords(records, communityId, authorizations);
    const publishedListings = reducePublishedListingRecords(
      communityRecords.filter((record) => record.kind === PUBLISHED_LISTING_RECORD_KIND),
      communityId,
    );
    const acceptedProposals = reduceAcceptedExchangeProposalRecords(
      communityRecords.filter((record) => record.kind === ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND),
      communityId,
    );
    const transfers = reduceLedgerTransferRecords(
      communityRecords.filter((record) => record.kind === LEDGER_TRANSFER_RECORD_KIND),
      communityId,
    );
    const proposalsById = new Map(acceptedProposals.map((proposal) => [proposal.id, proposal]));

    for (const transfer of transfers) {
      if (transfer.reversesTransferId !== undefined) continue;
      const proposal = proposalsById.get(transfer.sourceProposalId ?? "");
      if (proposal === undefined) {
        throw new RecordResolutionError("A settlement transfer must resolve its accepted proposal from replicated records.");
      }
      validateSettlementTransfer({ proposal, transfer });
    }

    const ledger = applyTransfers({
      communityId,
      transfers,
      verifyAttestation: createEd25519SignatureVerifier(authorizations),
    });

    return Object.freeze({
      communityId,
      authorizations,
      publishedListings,
      acceptedProposals,
      transfers,
      ledger,
    });
  } catch (error) {
    if (error instanceof RecordResolutionError) throw error;
    const detail = error instanceof Error ? error.message : "Unknown record resolution failure.";
    throw new RecordResolutionError(detail);
  }
}

/** Admits known member-authored domain records only when an active authorized key signed them. */
function assertMemberSignedDomainRecords(
  records: readonly (RecordEnvelope | MemberSignedRecord)[],
  communityId: string,
  authorizations: readonly MemberSigningKeyAuthorization[],
): void {
  for (const record of records) {
    if (record.communityId !== communityId || !isMemberAuthoredDomainRecord(record)) continue;
    if (!isMemberSignedRecord(record)) {
      throw new RecordResolutionError("A member-originated domain record must include an authorized member signature.");
    }
    if (!verifyMemberSignedRecord(record, authorizations)) {
      throw new RecordResolutionError("A member-originated domain record signature is invalid or not authorized.");
    }
    assertRecordAuthorParticipates(record);
  }
}

/** Ensures a signed record author performed the proposal acceptance or participates in the transfer. */
function assertRecordAuthorParticipates(record: MemberSignedRecord): void {
  if (record.kind === ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND) {
    const proposal = decodeAcceptedExchangeProposalRecord(record);
    if (record.authorId !== proposal.acceptedByMemberId) {
      throw new RecordResolutionError("An accepted proposal record must be signed by the member who accepted it.");
    }
    return;
  }

  if (record.kind === PUBLISHED_LISTING_RECORD_KIND) {
    const listing = decodePublishedListingRecord(record);
    if (record.authorId !== listing.memberId) {
      throw new RecordResolutionError("A published listing record must be signed by its member owner.");
    }
    return;
  }

  const transfer = decodeLedgerTransferRecord(record);
  if (record.authorId !== transfer.providerMemberId && record.authorId !== transfer.recipientMemberId) {
    throw new RecordResolutionError("A ledger transfer record must be submitted by one of its participants.");
  }
}

/** Limits signature admission to record kinds whose authorship has a defined member meaning today. */
function isMemberAuthoredDomainRecord(record: RecordEnvelope): boolean {
  return record.kind === PUBLISHED_LISTING_RECORD_KIND || record.kind === ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND || record.kind === LEDGER_TRANSFER_RECORD_KIND;
}

/** Narrows envelopes that carry member signing-key lifecycle actions. */
function isIdentityRecord(record: RecordEnvelope): boolean {
  return record.kind === IDENTITY_KEY_ACTIVATION_RECORD_KIND || record.kind === IDENTITY_KEY_REVOCATION_RECORD_KIND;
}
