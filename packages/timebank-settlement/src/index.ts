import { type ExchangeProposal } from "@peer-hours/timebank-domain";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";

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

export * from "./settlement-acknowledgement.js";
