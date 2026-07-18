import { type ExchangeProposal } from "@peer-hours/timebank-domain";

/** One participant's immutable acknowledgement that an accepted exchange has been completed. */
export interface SettlementAcknowledgement {
  /** Stable, lifecycle-specific acknowledgement identifier. */
  readonly id: string;
  /** Community in which the acknowledged exchange was agreed. */
  readonly communityId: string;
  /** Accepted proposal whose exact terms this acknowledgement confirms. */
  readonly sourceProposalId: string;
  /** Member who provided the service in the accepted exchange. */
  readonly providerMemberId: string;
  /** Member who received the service in the accepted exchange. */
  readonly recipientMemberId: string;
  /** Exact accepted exchange amount, in positive whole minutes. */
  readonly minutes: number;
  /** Participant making this acknowledgement. */
  readonly acknowledgedByMemberId: string;
}

/** The resolved confirmation state for one accepted exchange. */
export interface SettlementConfirmationState {
  /** Accepted proposal whose settlement state was resolved. */
  readonly proposalId: string;
  /** `awaiting-counterparty` until both distinct participants acknowledge the same terms. */
  readonly status: "awaiting-counterparty" | "dual-confirmed";
  /** Valid immutable acknowledgements, sorted by participant identifier. */
  readonly acknowledgements: readonly SettlementAcknowledgement[];
}

/** Error raised when an acknowledgement does not exactly honor an accepted exchange. */
export class SettlementAcknowledgementRuleError extends Error {
  /** Creates a readable acknowledgement rule error. */
  constructor(message: string) {
    super(message);
    this.name = "SettlementAcknowledgementRuleError";
  }
}

/** Creates one participant-owned acknowledgement for the exact terms of an accepted exchange. */
export function createSettlementAcknowledgement(
  proposal: ExchangeProposal,
  acknowledgedByMemberId: string,
): SettlementAcknowledgement {
  assertAcceptedProposal(proposal);
  assertParticipant(proposal, acknowledgedByMemberId);

  return Object.freeze({
    id: settlementAcknowledgementId(proposal.id, acknowledgedByMemberId),
    communityId: proposal.communityId,
    sourceProposalId: proposal.id,
    providerMemberId: proposal.providerMemberId,
    recipientMemberId: proposal.receiverMemberId,
    minutes: proposal.minutes,
    acknowledgedByMemberId,
  });
}

/** Validates an acknowledgement against its source proposal without granting ledger finality. */
export function validateSettlementAcknowledgement(
  proposal: ExchangeProposal,
  acknowledgement: SettlementAcknowledgement,
): SettlementAcknowledgement {
  assertAcceptedProposal(proposal);
  assertText(acknowledgement.id, "Settlement acknowledgement id");
  assertText(acknowledgement.communityId, "Settlement acknowledgement community id");
  assertText(acknowledgement.sourceProposalId, "Settlement acknowledgement source proposal id");
  assertText(acknowledgement.providerMemberId, "Settlement acknowledgement provider member id");
  assertText(acknowledgement.recipientMemberId, "Settlement acknowledgement recipient member id");
  assertText(acknowledgement.acknowledgedByMemberId, "Settlement acknowledgement member id");
  assertPositiveWholeMinutes(acknowledgement.minutes);

  if (acknowledgement.id !== settlementAcknowledgementId(proposal.id, acknowledgement.acknowledgedByMemberId)) {
    throw new SettlementAcknowledgementRuleError("A settlement acknowledgement id must name its proposal and acknowledging participant.");
  }
  if (
    acknowledgement.communityId !== proposal.communityId ||
    acknowledgement.sourceProposalId !== proposal.id ||
    acknowledgement.providerMemberId !== proposal.providerMemberId ||
    acknowledgement.recipientMemberId !== proposal.receiverMemberId ||
    acknowledgement.minutes !== proposal.minutes
  ) {
    throw new SettlementAcknowledgementRuleError("A settlement acknowledgement must preserve every accepted proposal term.");
  }
  assertParticipant(proposal, acknowledgement.acknowledgedByMemberId);
  return Object.freeze({ ...acknowledgement });
}

/** Resolves acknowledgements without treating a one-sided claim as final settlement. */
export function resolveSettlementAcknowledgements(
  proposal: ExchangeProposal,
  acknowledgements: readonly SettlementAcknowledgement[],
): SettlementConfirmationState {
  assertAcceptedProposal(proposal);
  const byParticipant = new Map<string, SettlementAcknowledgement>();
  for (const acknowledgement of acknowledgements) {
    const normalized = validateSettlementAcknowledgement(proposal, acknowledgement);
    const existing = byParticipant.get(normalized.acknowledgedByMemberId);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(normalized)) {
      throw new SettlementAcknowledgementRuleError("A participant cannot publish conflicting settlement acknowledgements.");
    }
    byParticipant.set(normalized.acknowledgedByMemberId, normalized);
  }

  const resolved = Object.freeze([...byParticipant.values()].sort((left, right) =>
    left.acknowledgedByMemberId.localeCompare(right.acknowledgedByMemberId),
  ));
  const dualConfirmed = byParticipant.has(proposal.providerMemberId) && byParticipant.has(proposal.receiverMemberId);
  return Object.freeze({
    proposalId: proposal.id,
    status: dualConfirmed ? "dual-confirmed" : "awaiting-counterparty",
    acknowledgements: resolved,
  });
}

/** Derives the unique append-only identity for one participant acknowledgement. */
export function settlementAcknowledgementId(proposalId: string, memberId: string): string {
  assertText(proposalId, "Proposal id");
  assertText(memberId, "Acknowledging member id");
  return `${proposalId}/settlement-ack/${memberId}`;
}

/** Ensures an acknowledgement can only be attached to an accepted exchange. */
function assertAcceptedProposal(proposal: ExchangeProposal): void {
  if (proposal.status !== "accepted" || proposal.acceptedByMemberId === undefined) {
    throw new SettlementAcknowledgementRuleError("Only an accepted proposal can be acknowledged as settled.");
  }
}

/** Ensures the acknowledging member is a participant in the source exchange. */
function assertParticipant(proposal: ExchangeProposal, memberId: string): void {
  assertText(memberId, "Acknowledging member id");
  if (memberId !== proposal.providerMemberId && memberId !== proposal.receiverMemberId) {
    throw new SettlementAcknowledgementRuleError("Only an exchange participant may acknowledge its settlement.");
  }
}

/** Ensures a protocol text field has meaningful content. */
function assertText(value: string, label: string): void {
  if (value.trim().length === 0) throw new SettlementAcknowledgementRuleError(`${label} is required.`);
}

/** Ensures an acknowledgement amount remains a positive, whole minute value. */
function assertPositiveWholeMinutes(minutes: number): void {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
    throw new SettlementAcknowledgementRuleError("Settlement acknowledgement minutes must be positive whole numbers.");
  }
}
