import type { LocalPeerStatus } from "@peer-hours/peer-runtime";

declare global {
  interface Window {
    peerHours: {
      platform: string;
      getNetworkStatus: () => Promise<LocalPeerStatus>;
      onNetworkStatusChanged: (listener: (status: LocalPeerStatus) => void) => () => void;
    };
  }
}

export {};
