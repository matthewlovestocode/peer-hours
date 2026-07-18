import type { AcceptedProposal, SettlementAttestationState, SettlementConfirmation } from "./types.js";

/** A member-facing, non-final settlement workflow phase for one accepted exchange. */
export type SettlementLifecycle = "ready-to-acknowledge" | "awaiting-counterparty" | "ready-to-attest" | "awaiting-counterparty-attestation" | "ready-to-publish" | "locally-admitted";

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
): SettlementProgress {
  if (settledProposalIds.includes(proposal.id)) return { lifecycle: "locally-admitted", counterpartyAcknowledged: true };

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

/** Returns copy that preserves the difference between local workflow state and finality. */
export function settlementLifecycleMessage(lifecycle: SettlementLifecycle): string {
  switch (lifecycle) {
    case "ready-to-acknowledge": return "Your completion acknowledgement is needed.";
    case "awaiting-counterparty": return "Your acknowledgement is recorded; waiting for the other participant.";
    case "ready-to-attest": return "Both participants acknowledged completion. Sign your attestation of the deterministic transfer terms.";
    case "awaiting-counterparty-attestation": return "Your attestation is recorded; waiting for the other participant’s attestation.";
    case "ready-to-publish": return "Both participant attestations are present. Publish the deterministic transfer for local ledger admission.";
    case "locally-admitted": return "A matching transfer is locally admitted to this device’s ledger. This is not a claim of durable replication or network finality.";
  }
}
