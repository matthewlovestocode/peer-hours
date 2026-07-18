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

/** The verified member-feed state exposed through the narrow Electron bridge. */
export type ResolvedMemberState =
  | { state: "unavailable" | "rejected"; reason: string }
  | {
    state: "ready";
    publishedListings: readonly ResolvedListing[];
    proposedProposals: readonly PendingProposal[];
    acceptedProposals: readonly AcceptedProposal[];
    settlementConfirmations: readonly SettlementConfirmation[];
    /** Proposal ids whose matching transfer this device locally admitted to its ledger. */
    settledProposalIds: readonly string[];
    /** Count of locally admitted transfers; this is not a replication-finality claim. */
    transferCount: number;
  };
