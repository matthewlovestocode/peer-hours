import { create } from "zustand";
import type { LocalPeerStatus } from "@peer-hours/peer-runtime";

type NetworkState = {
  status: LocalPeerStatus | null;
  state: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  lastUpdatedAt: string | null;
  refresh: () => Promise<void>;
};

/** Owns the desktop client's node connection state and periodic status refresh behavior. */
export const useNetworkStore = create<NetworkState>((set, get) => ({
  status: null,
  state: "idle",
  error: null,
  lastUpdatedAt: null,
  refresh: async () => {
    if (!get().status) set({ state: "connecting", error: null });
    try {
      const status = await window.peerHours.getNetworkStatus();
      set({ status, state: "connected", lastUpdatedAt: new Date().toISOString() });
    } catch (error) {
      set({ state: "error", error: error instanceof Error ? error.message : "Unable to reach node" });
    }
  },
}));
