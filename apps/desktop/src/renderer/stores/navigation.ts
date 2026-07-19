import { create } from "zustand";

/** Names the top-level desktop workspaces that the application shell may display. */
export type WorkspaceId = "home" | "activity" | "history" | "network" | "create-offer" | "create-request";

type NavigationState = {
  activeWorkspace: WorkspaceId;
  drawerOpen: boolean;
  setActiveWorkspace: (workspace: WorkspaceId) => void;
  toggleDrawer: () => void;
  closeDrawer: () => void;
};

/** Owns application-shell navigation state independently from network and domain data. */
export const useNavigationStore = create<NavigationState>((set) => ({
  activeWorkspace: "home",
  drawerOpen: false,
  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace, drawerOpen: false }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  closeDrawer: () => set({ drawerOpen: false }),
}));
