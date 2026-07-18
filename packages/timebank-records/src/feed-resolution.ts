import { type MemberSigningKeyAuthorization } from "@peer-hours/timebank-identity";
import { type ExchangeProposal, type Listing } from "@peer-hours/timebank-domain";
import { type Ledger, type Transfer } from "@peer-hours/timebank-ledger";
import {
  type SettlementAcknowledgement,
  type SettlementConfirmationState,
} from "@peer-hours/timebank-settlement";
import { type RecordEnvelope } from "./envelope.js";
import { MEMBER_FEED_DECLARATION_RECORD_KIND, memberFeedDeclarationFromRecord } from "./self-owned-identity-records.js";
import { resolveTimebankRecords } from "./resolve.js";
import { isMemberSignedRecord, type MemberSignedRecord } from "./member-signed-record.js";
import {
  ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND,
  LEDGER_TRANSFER_RECORD_KIND,
  PUBLISHED_LISTING_RECORD_KIND,
  PROPOSED_EXCHANGE_PROPOSAL_RECORD_KIND,
  SETTLEMENT_ACKNOWLEDGEMENT_RECORD_KIND,
} from "./timebank-records.js";

/** A concrete replicated history read from one known member-owned Hypercore feed. */
export interface MemberFeedHistory {
  readonly feedPublicKey: string;
  readonly records: readonly (RecordEnvelope | MemberSignedRecord)[];
}

/** The resolved timebank view whose member-authored records were checked against their source feed. */
export interface FeedResolvedTimebankState {
  readonly communityId: string;
  readonly authorizations: readonly MemberSigningKeyAuthorization[];
  readonly publishedListings: readonly Listing[];
  readonly proposedProposals: readonly ExchangeProposal[];
  readonly acceptedProposals: readonly ExchangeProposal[];
  /** Participant acknowledgements admitted only from their declared member feeds. */
  readonly settlementAcknowledgements: readonly SettlementAcknowledgement[];
  /** Acknowledgement progress per accepted proposal; this is not transfer finality. */
  readonly settlementConfirmations: readonly SettlementConfirmationState[];
  readonly transfers: readonly Transfer[];
  readonly ledger: Ledger;
}

/** Raises a readable error when a member-authored record did not arrive through its declared feed. */
export class MemberFeedResolutionError extends Error {
  /** Creates a feed-provenance resolution error. */
  constructor(message: string) {
    super(message);
    this.name = "MemberFeedResolutionError";
  }
}

/** Resolves member-feed histories only after each signed domain record is tied to its declared source feed. */
export function resolveTimebankMemberFeeds(
  communityId: string,
  histories: readonly MemberFeedHistory[],
): FeedResolvedTimebankState {
  const memberFeedKeys = declaredFeedKeysByMember(communityId, histories);
  const records: (RecordEnvelope | MemberSignedRecord)[] = [];

  for (const history of histories) {
    assertFeedPublicKey(history.feedPublicKey);
    for (const record of history.records) {
      if (record.communityId === communityId && isMemberAuthoredDomainRecord(record)) {
        const declaredKeys = memberFeedKeys.get(record.authorId);
        if (declaredKeys === undefined || !declaredKeys.has(history.feedPublicKey)) {
          throw new MemberFeedResolutionError("A member-authored record must arrive through a feed declared by its self-owned identity.");
        }
      }
      records.push(record);
    }
  }

  const resolved = resolveTimebankRecords(communityId, records);
  return Object.freeze({
    communityId: resolved.communityId,
    authorizations: resolved.authorizations,
    publishedListings: resolved.publishedListings,
    proposedProposals: resolved.proposedProposals,
    acceptedProposals: resolved.acceptedProposals,
    settlementAcknowledgements: resolved.settlementAcknowledgements,
    settlementConfirmations: resolved.settlementConfirmations,
    transfers: resolved.transfers,
    ledger: resolved.ledger,
  });
}

/** Collects valid root-signed declarations before admitting any domain record from a member feed. */
function declaredFeedKeysByMember(communityId: string, histories: readonly MemberFeedHistory[]): ReadonlyMap<string, ReadonlySet<string>> {
  const keysByMember = new Map<string, Set<string>>();
  for (const history of histories) {
    assertFeedPublicKey(history.feedPublicKey);
    for (const record of history.records) {
      if (record.communityId !== communityId || record.kind !== MEMBER_FEED_DECLARATION_RECORD_KIND) continue;
      const declaration = memberFeedDeclarationFromRecord(record);
      const keys = keysByMember.get(declaration.memberId) ?? new Set<string>();
      keys.add(declaration.feedPublicKey);
      keysByMember.set(declaration.memberId, keys);
    }
  }
  return keysByMember;
}

/** Limits feed provenance checks to record kinds whose authorship semantics are already explicit. */
function isMemberAuthoredDomainRecord(record: RecordEnvelope): boolean {
  return record.kind === PUBLISHED_LISTING_RECORD_KIND ||
    record.kind === PROPOSED_EXCHANGE_PROPOSAL_RECORD_KIND ||
    record.kind === ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND ||
    record.kind === SETTLEMENT_ACKNOWLEDGEMENT_RECORD_KIND ||
    record.kind === LEDGER_TRANSFER_RECORD_KIND;
}

/** Rejects malformed feed addresses before a caller can mistake arbitrary text for a Hypercore identity. */
function assertFeedPublicKey(value: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new MemberFeedResolutionError("A member feed history must use a 64-character hexadecimal Hypercore key.");
  }
}
