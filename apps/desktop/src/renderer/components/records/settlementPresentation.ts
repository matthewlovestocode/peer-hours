import type { AcceptedProposal, SettlementAttestationState, SettlementConfirmation, SettlementDurabilityState } from "./types.js";

/** A member-facing settlement workflow phase that keeps retention evidence non-authoritative. */
export type SettlementLifecycle = "ready-to-acknowledge" | "awaiting-counterparty" | "ready-to-attest" | "awaiting-counterparty-attestation" | "ready-to-publish" | "waiting-for-durable-replication" | "durably-replicated" | "resiliently-replicated";

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
  attestationState: SettlementAttestationState | undefined,
  memberId: string,
  settledProposalIds: readonly string[],
  durability: SettlementDurabilityState | undefined,
): SettlementProgress {
  if (settledProposalIds.includes(proposal.id)) {
    return { lifecycle: settlementDurabilityLifecycle(durability?.verifiedPinnedReceiptCount), counterpartyAcknowledged: true };
  }

  const acknowledgedBy = new Set(confirmation?.acknowledgements.map(({ acknowledgedByMemberId }) => acknowledgedByMemberId));
  const memberAcknowledged = acknowledgedBy.has(memberId);
  const counterpartyMemberId = proposal.providerMemberId === memberId ? proposal.receiverMemberId : proposal.providerMemberId;
  const counterpartyAcknowledged = acknowledgedBy.has(counterpartyMemberId);

  if (confirmation?.status === "dual-confirmed") {
    const attestingMembers = new Set(attestationState?.attestations.map(({ memberId: attestingMemberId }) => attestingMemberId));
    if (!attestingMembers.has(memberId)) return { lifecycle: "ready-to-attest", counterpartyAcknowledged: true };
    if (!attestingMembers.has(counterpartyMemberId)) return { lifecycle: "awaiting-counterparty-attestation", counterpartyAcknowledged: true };
    return { lifecycle: "ready-to-publish", counterpartyAcknowledged: true };
  }
  if (memberAcknowledged) return { lifecycle: "awaiting-counterparty", counterpartyAcknowledged };
  return { lifecycle: "ready-to-acknowledge", counterpartyAcknowledged };
}

/**
 * Converts main-process-verified receipt evidence into a non-authoritative availability label.
 * Any malformed count remains at the conservative local-admission state.
 */
export function settlementDurabilityLifecycle(receiptCount: unknown): Extract<SettlementLifecycle, "waiting-for-durable-replication" | "durably-replicated" | "resiliently-replicated"> {
  if (typeof receiptCount !== "number" || !Number.isSafeInteger(receiptCount) || receiptCount < 1) return "waiting-for-durable-replication";
  return receiptCount === 1 ? "durably-replicated" : "resiliently-replicated";
}

/** Returns copy that preserves the difference between local workflow state and retention evidence. */
export function settlementLifecycleMessage(lifecycle: SettlementLifecycle): string {
  switch (lifecycle) {
    case "ready-to-acknowledge": return "Your completion acknowledgement is needed.";
    case "awaiting-counterparty": return "Your acknowledgement is recorded; waiting for the other participant.";
    case "ready-to-attest": return "Both participants confirmed completion. Add your signed confirmation of the agreed exchange.";
    case "awaiting-counterparty-attestation": return "Your confirmation is recorded; waiting for the other participant’s confirmation.";
    case "ready-to-publish": return "Both confirmations are present. Record the completed exchange on this device.";
    case "waiting-for-durable-replication": return "This device has recorded the exchange. Waiting for a trusted community node to confirm that it retains the history; that confirmation does not decide validity, balances, or disputes.";
    case "durably-replicated": return "This device recorded the exchange and one trusted community node confirmed it retains the history. This shows availability, not validity, balances, or dispute outcomes.";
    case "resiliently-replicated": return "This device recorded the exchange and two or more trusted community nodes confirmed they retain the history. This shows availability, not validity, balances, or dispute outcomes.";
  }
}
