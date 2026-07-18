import type { AcceptedProposal, SettlementConfirmation } from "./types.js";

/** A member-facing, non-final settlement workflow phase for one accepted exchange. */
export type SettlementLifecycle = "ready-to-acknowledge" | "awaiting-counterparty" | "dual-confirmed" | "settled";

/** Describes the verified acknowledgement and local-ledger state for one accepted exchange. */
export type SettlementProgress = {
  readonly lifecycle: SettlementLifecycle;
  readonly counterpartyAcknowledged: boolean;
};

/**
 * Derives an explicit next workflow phase without promoting acknowledgement or local ledger
 * application into network finality.
 */
export function settlementProgress(
  proposal: AcceptedProposal,
  confirmation: SettlementConfirmation | undefined,
  memberId: string,
  settledProposalIds: readonly string[],
): SettlementProgress {
  if (settledProposalIds.includes(proposal.id)) return { lifecycle: "settled", counterpartyAcknowledged: true };

  const acknowledgedBy = new Set(confirmation?.acknowledgements.map(({ acknowledgedByMemberId }) => acknowledgedByMemberId));
  const memberAcknowledged = acknowledgedBy.has(memberId);
  const counterpartyMemberId = proposal.providerMemberId === memberId ? proposal.receiverMemberId : proposal.providerMemberId;
  const counterpartyAcknowledged = acknowledgedBy.has(counterpartyMemberId);

  if (confirmation?.status === "dual-confirmed") return { lifecycle: "dual-confirmed", counterpartyAcknowledged: true };
  if (memberAcknowledged) return { lifecycle: "awaiting-counterparty", counterpartyAcknowledged };
  return { lifecycle: "ready-to-acknowledge", counterpartyAcknowledged };
}

/** Returns copy that preserves the difference between local workflow state and finality. */
export function settlementLifecycleMessage(lifecycle: SettlementLifecycle): string {
  switch (lifecycle) {
    case "ready-to-acknowledge": return "Your completion acknowledgement is needed.";
    case "awaiting-counterparty": return "Your acknowledgement is recorded; waiting for the other participant.";
    case "dual-confirmed": return "Both participants acknowledged completion. A deterministic transfer still requires participant attestations and local ledger admission.";
    case "settled": return "A matching transfer is locally admitted to this device’s ledger. This is not a claim of durable replication or network finality.";
  }
}
