import type { LocalPeerStatus } from "@peer-hours/peer-runtime";

declare global {
  interface Window {
    peerHours: {
      platform: string;
      getNetworkStatus: () => Promise<LocalPeerStatus>;
      getMemberRecords: () => Promise<readonly unknown[]>;
      getMemberIdentityStatus: () => Promise<{ state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null }>;
      createAndAnnounceMemberIdentity: () => Promise<{ state: "unavailable" | "not-created" | "ready"; memberId: string | null; communityId: string | null }>;
      onNetworkStatusChanged: (listener: (status: LocalPeerStatus) => void) => () => void;
    };
  }
}

export {};
