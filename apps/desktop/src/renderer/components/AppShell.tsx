import type { PropsWithChildren } from "react";

/** Provides the persistent desktop frame with an accessible navigation trigger and workspace region. */
export function AppShell({ children, drawerOpen, onToggleDrawer }: PropsWithChildren<{ drawerOpen: boolean; onToggleDrawer: () => void }>) {
  return <div className="app-shell"><header className="app-topbar"><button className="icon-button" type="button" onClick={onToggleDrawer} aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="app-navigation"><span aria-hidden="true">☰</span></button><div className="app-topbar__brand"><span className="app-topbar__mark" aria-hidden="true">◌</span><span>Peer Hours</span></div></header><main className="app-workspace">{children}</main></div>;
}
