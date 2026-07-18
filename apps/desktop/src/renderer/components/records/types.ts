/** A locally verified listing that can participate in a proposal. */
export type ResolvedListing = {
  id: string;
  memberId: string;
  kind: string;
  title: string;
  minutes: number;
};

/** A locally verified proposal that remains pending a counterparty's signature. */
export type PendingProposal = {
  id: string;
  creatorMemberId: string;
  providerMemberId: string;
  receiverMemberId: string;
  minutes: number;
};

/** A locally verified accepted exchange whose completion can be acknowledged by its participants. */
export type AcceptedProposal = {
  id: string;
  providerMemberId: string;
  receiverMemberId: string;
  minutes: number;
};

/** The non-ledger completion state derived from participant acknowledgements. */
export type SettlementConfirmation = {
  proposalId: string;
  status: "awaiting-counterparty" | "dual-confirmed";
  acknowledgements: readonly { acknowledgedByMemberId: string }[];
};

/** A replicated participant attestation over deterministic settlement terms, without key material. */
export type SettlementAttestationState = {
  proposalId: string;
  attestations: readonly { memberId: string }[];
};

/** A main-process-verified count of distinct pinned community-node retention receipts. */
export type SettlementDurabilityState = {
  proposalId: string;
  verifiedPinnedReceiptCount: number;
};

/** The verified member-feed state exposed through the narrow Electron bridge. */
export type ResolvedMemberState =
  | { state: "unavailable" | "rejected"; reason: string }
  | {
    state: "ready";
    publishedListings: readonly ResolvedListing[];
    proposedProposals: readonly PendingProposal[];
    acceptedProposals: readonly AcceptedProposal[];
    settlementConfirmations: readonly SettlementConfirmation[];
    /** Participant attestations observed for dual-confirmed settlement terms. */
    settlementAttestations: readonly SettlementAttestationState[];
    /** Proposal ids whose matching transfer this device locally admitted to its ledger. */
    settledProposalIds: readonly string[];
    /**
     * Verified availability evidence only for locally admitted transfers. Receipt counts never
     * determine transfer validity, balances, or dispute outcomes.
     */
    settlementDurability: readonly SettlementDurabilityState[];
    /** Count of locally admitted transfers; this is not a replication-finality claim. */
    transferCount: number;
  };
