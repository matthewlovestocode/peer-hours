import { type ExchangeProposal } from "@peer-hours/timebank-domain";
import {
  createTransfer,
  type Transfer,
  type TransferAttestation,
} from "@peer-hours/timebank-ledger";
import {
  resolveSettlementAcknowledgements,
  type SettlementAcknowledgement,
} from "./settlement-acknowledgement.js";

/** Input used to verify that one settlement transfer honors its accepted exchange proposal. */
export interface ValidateSettlementTransferInput {
  readonly proposal: ExchangeProposal;
  readonly transfer: Transfer;
}

/** Error raised when a signed settlement transfer does not honor its source proposal. */
export class SettlementRuleError extends Error {
  /** Creates a readable settlement-integration rule error. */
  constructor(message: string) {
    super(message);
    this.name = "SettlementRuleError";
  }
}

/** Input required to compose the only normal transfer for a dual-confirmed exchange. */
export interface CreateDualConfirmedSettlementTransferInput {
  /** The accepted proposal whose exact terms become the transfer terms. */
  readonly proposal: ExchangeProposal;
  /** The replicated participant acknowledgements for that accepted proposal. */
  readonly acknowledgements: readonly SettlementAcknowledgement[];
  /** Both participant attestations over the resulting deterministic transfer terms. */
  readonly attestations: readonly TransferAttestation[];
}

/**
 * Validates that a non-reversal transfer is the exact settlement for one accepted proposal.
 *
 * This bridge intentionally does not verify signatures or derive balances: those concerns remain
 * in the identity and ledger packages. It prevents independent callers from treating an arbitrary
 * transfer that merely names a proposal as an authorized settlement for that proposal.
 */
export function validateSettlementTransfer(input: ValidateSettlementTransferInput): Transfer {
  const { proposal } = input;
  const transfer = createTransfer(input.transfer);

  if (proposal.status !== "accepted" || proposal.acceptedByMemberId === undefined) {
    throw new SettlementRuleError("Only an accepted proposal can produce a settlement transfer.");
  }
  if (transfer.reversesTransferId !== undefined) {
    throw new SettlementRuleError("A compensating reversal cannot settle an exchange proposal.");
  }
  if (transfer.sourceProposalId !== proposal.id) {
    throw new SettlementRuleError("A settlement transfer must reference its accepted proposal.");
  }
  if (transfer.communityId !== proposal.communityId) {
    throw new SettlementRuleError("A settlement transfer must remain in its proposal community.");
  }
  if (
    transfer.providerMemberId !== proposal.providerMemberId ||
    transfer.recipientMemberId !== proposal.receiverMemberId
  ) {
    throw new SettlementRuleError("A settlement transfer must preserve its proposal participants.");
  }
  if (transfer.minutes !== proposal.minutes) {
    throw new SettlementRuleError("A settlement transfer must preserve its proposal minute amount.");
  }

  return transfer;
}

/**
 * Composes the deterministic normal transfer for an accepted exchange after both participants
 * acknowledged its completion.
 *
 * This is deliberately a composition boundary, not a finality decision. It checks that the
 * acknowledgements are mutually consistent and makes the transfer id deterministic per proposal,
 * but it cannot verify the supplied signatures or prove durable replication. Callers must verify
 * the resulting attestations through `@peer-hours/timebank-identity` and satisfy their explicit
 * replication acknowledgement policy before presenting the exchange as settled.
 */
export function createDualConfirmedSettlementTransfer(
  input: CreateDualConfirmedSettlementTransferInput,
): Transfer {
  const confirmation = resolveSettlementAcknowledgements(input.proposal, input.acknowledgements);
  if (confirmation.status !== "dual-confirmed") {
    throw new SettlementRuleError("Both exchange participants must acknowledge completion before composing a settlement transfer.");
  }

  const transfer = createTransfer({
    id: settlementTransferId(input.proposal.id),
    communityId: input.proposal.communityId,
    sourceProposalId: input.proposal.id,
    providerMemberId: input.proposal.providerMemberId,
    recipientMemberId: input.proposal.receiverMemberId,
    minutes: input.proposal.minutes,
    attestations: input.attestations,
  });
  return validateSettlementTransfer({ proposal: input.proposal, transfer });
}

/**
 * Derives the unique normal-transfer identity for one accepted proposal.
 *
 * Ledger duplicate-settlement checks remain authoritative, while this deterministic id gives
 * independent publishers the same immutable record identity instead of competing alternatives.
 */
export function settlementTransferId(proposalId: string): string {
  if (proposalId.trim().length === 0) {
    throw new SettlementRuleError("Proposal id is required.");
  }
  return `${proposalId}/settlement`;
}

export * from "./settlement-acknowledgement.js";
