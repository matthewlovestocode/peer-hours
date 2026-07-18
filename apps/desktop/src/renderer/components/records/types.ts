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

/** The verified member-feed state exposed through the narrow Electron bridge. */
export type ResolvedMemberState = Awaited<ReturnType<typeof window.peerHours.getResolvedMemberState>>;
