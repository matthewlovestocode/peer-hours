import type { LocalPeerStatus } from "@peer-hours/peer-runtime";

declare global {
  interface Window {
    peerHours: {
      platform: string;
      getNetworkStatus: () => Promise<LocalPeerStatus>;
      getMemberRecords: () => Promise<readonly unknown[]>;
      getMemberIdentityStatus: () => Promise<{ state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null; deviceSigningKeys: readonly { keyId: string; state: "active" | "revoked"; occurredAt: string }[] }>;
      createAndAnnounceMemberIdentity: () => Promise<{ state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null; deviceSigningKeys: readonly { keyId: string; state: "active" | "revoked"; occurredAt: string }[] }>;
      activateDeviceSigningKey: () => Promise<void>;
      revokeDeviceSigningKey: (keyId: string) => Promise<void>;
      publishListing: (input: { kind: "offer" | "request"; title: string; description: string; minutes: number }) => Promise<void>;
      listCommunities: () => Promise<readonly { genesis: { communityId: string; displayName: string; location: { locality: string; region?: string; country: string } | null }; invitation: { communityId: string; discoveryKey: string }; savedAt: string }[]>;
      createCommunity: (input: { displayName: string; locality: string; region?: string; country: string }) => Promise<{ genesis: { communityId: string; displayName: string }; invitation: string }>;
      joinCommunity: (invitation: string) => Promise<{ communityId: string; displayName: string }>;
      closeListing: (listingId: string) => Promise<void>;
      getResolvedMemberState: () => Promise<{ state: "unavailable" | "rejected"; reason: string } | { state: "ready"; publishedListings: readonly { id: string; memberId: string; kind: string; title: string; description: string; minutes: number }[]; proposedProposals: readonly { id: string; creatorMemberId: string; providerMemberId: string; receiverMemberId: string; minutes: number }[]; acceptedProposals: readonly { id: string; providerMemberId: string; receiverMemberId: string; minutes: number }[]; settlementConfirmations: readonly { proposalId: string; status: "awaiting-counterparty" | "dual-confirmed"; acknowledgements: readonly { acknowledgedByMemberId: string }[] }[]; settlementAttestations: readonly { proposalId: string; attestations: readonly { memberId: string }[] }[]; settledProposalIds: readonly string[]; settlementDurability: readonly { proposalId: string; verifiedPinnedReceiptCount: number }[]; transferCount: number }>;
      createProposal: (input: { offerId: string; requestId: string; minutes: number }) => Promise<void>;
      acceptProposal: (proposalId: string) => Promise<void>;
      acknowledgeSettlement: (proposalId: string) => Promise<void>;
      advanceSettlement: (proposalId: string) => Promise<void>;
      onNetworkStatusChanged: (listener: (status: LocalPeerStatus) => void) => () => void;
    };
  }
}

export {};
