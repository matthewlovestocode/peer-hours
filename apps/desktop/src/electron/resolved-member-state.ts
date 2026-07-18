import type { ResolvedTimebankState } from "@peer-hours/timebank-records";

/** Defines the verified state that may cross from Electron main into the untrusted renderer. */
export type RendererResolvedMemberState = {
  readonly state: "ready";
  readonly publishedListings: readonly { readonly id: string; readonly memberId: string; readonly kind: string; readonly title: string; readonly minutes: number }[];
  readonly proposedProposals: readonly { readonly id: string; readonly creatorMemberId: string; readonly providerMemberId: string; readonly receiverMemberId: string; readonly minutes: number }[];
  readonly acceptedProposals: readonly { readonly id: string; readonly providerMemberId: string; readonly receiverMemberId: string; readonly minutes: number }[];
  readonly settlementConfirmations: readonly { readonly proposalId: string; readonly status: "awaiting-counterparty" | "dual-confirmed"; readonly acknowledgements: readonly { readonly acknowledgedByMemberId: string }[] }[];
  readonly settlementAttestations: readonly { readonly proposalId: string; readonly attestations: readonly { readonly memberId: string }[] }[];
  readonly settledProposalIds: readonly string[];
  /** Verified pinned-node receipt counts keyed by the transfer's source proposal. */
  readonly settlementDurability: readonly { readonly proposalId: string; readonly verifiedPinnedReceiptCount: number }[];
  readonly transferCount: number;
};

/**
 * Projects verified domain data into a deliberately small renderer-safe view.
 *
 * A proposal is `settled` here only when the local ledger accepted its transfer; dual
 * acknowledgement alone remains a separate, non-final state.
 */
export function presentResolvedMemberState(
  resolved: ResolvedTimebankState,
  settlementDurability: RendererResolvedMemberState["settlementDurability"] = [],
): RendererResolvedMemberState {
  const settledProposalIds = resolved.ledger.transfers
    .map((transfer) => transfer.sourceProposalId)
    .filter((proposalId): proposalId is string => proposalId !== undefined);

  return {
    state: "ready",
    publishedListings: resolved.publishedListings.map(({ id, memberId, kind, title, minutes }) => ({ id, memberId, kind, title, minutes })),
    proposedProposals: resolved.proposedProposals.map(({ id, creatorMemberId, providerMemberId, receiverMemberId, minutes }) => ({ id, creatorMemberId, providerMemberId, receiverMemberId, minutes })),
    acceptedProposals: resolved.acceptedProposals.map(({ id, providerMemberId, receiverMemberId, minutes }) => ({ id, providerMemberId, receiverMemberId, minutes })),
    settlementConfirmations: resolved.settlementConfirmations.map(({ proposalId, status, acknowledgements }) => ({
      proposalId,
      status,
      acknowledgements: acknowledgements.map(({ acknowledgedByMemberId }) => ({ acknowledgedByMemberId })),
    })),
    settlementAttestations: resolved.settlementAttestations.map(({ proposalId, attestations }) => ({
      proposalId,
      attestations: attestations.map(({ attestation }) => ({ memberId: attestation.memberId })),
    })),
    settledProposalIds,
    settlementDurability,
    transferCount: resolved.ledger.transfers.length,
  };
}
