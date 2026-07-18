import { type ExchangeProposal } from "@peer-hours/timebank-domain";
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
  ACCEPTED_EXCHANGE_PROPOSAL_RECORD_KIND,
  LEDGER_TRANSFER_RECORD_KIND,
  reduceAcceptedExchangeProposalRecords,
  reduceLedgerTransferRecords,
} from "./timebank-records.js";

/** The deterministic local timebank view derived from one replicated record history. */
export interface ResolvedTimebankState {
  readonly communityId: string;
  readonly authorizations: readonly MemberSigningKeyAuthorization[];
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
  records: readonly RecordEnvelope[],
): ResolvedTimebankState {
  try {
    const normalizedRecords = reduceRecordEnvelopes(records);
    const communityRecords = normalizedRecords.filter((record) => record.communityId === communityId);
    const authorizations = reduceMemberSigningKeyAuthorizationRecords(
      communityRecords.filter(isIdentityRecord),
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

/** Narrows envelopes that carry member signing-key lifecycle actions. */
function isIdentityRecord(record: RecordEnvelope): boolean {
  return record.kind === IDENTITY_KEY_ACTIVATION_RECORD_KIND || record.kind === IDENTITY_KEY_REVOCATION_RECORD_KIND;
}
