import { useState } from "react";
import type { ReactNode } from "react";
import type { WorkspaceId } from "../stores/navigation.js";

type NavigationDrawerProps = {
  activeWorkspace: WorkspaceId;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (workspace: WorkspaceId) => void;
};

/** Presents the application's expandable left navigation without coupling it to feature data. */
export function NavigationDrawer({ activeWorkspace, isOpen, onClose, onNavigate }: NavigationDrawerProps) {
  const [communityOpen, setCommunityOpen] = useState(true);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  return <><button className={`drawer-scrim ${isOpen ? "drawer-scrim--visible" : ""}`} type="button" aria-label="Close navigation" tabIndex={isOpen ? 0 : -1} onClick={onClose} /><aside className={`navigation-drawer ${isOpen ? "navigation-drawer--open" : ""}`} id="app-navigation" aria-hidden={!isOpen}><div className="navigation-drawer__header"><span className="kicker">Navigation</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close navigation">×</button></div><nav aria-label="Primary navigation"><NavigationButton active={activeWorkspace === "home"} label="Home" onClick={() => onNavigate("home")} /><NavigationButton active={activeWorkspace === "records"} label="My records" onClick={() => onNavigate("records")} /><NavigationGroup expanded={communityOpen} label="Community" onToggle={() => setCommunityOpen((open) => !open)}><NavigationPlaceholder label="Overview" /><NavigationPlaceholder label="People" /></NavigationGroup><NavigationGroup expanded={exchangeOpen} label="Exchange" onToggle={() => setExchangeOpen((open) => !open)}><NavigationPlaceholder label="Offers" /><NavigationPlaceholder label="Requests" /></NavigationGroup><NavigationButton active={activeWorkspace === "network"} label="Network" onClick={() => onNavigate("network")} /></nav><p className="navigation-drawer__footer">More sections can be added here as the product takes shape.</p></aside></>;
}

/** Renders a top-level navigation destination. */
function NavigationButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={`navigation-item ${active ? "navigation-item--active" : ""}`} type="button" onClick={onClick}>{label}</button>;
}

/** Renders an expandable navigation group for future nested workspaces. */
function NavigationGroup({ children, expanded, label, onToggle }: { children: ReactNode; expanded: boolean; label: string; onToggle: () => void }) {
  return <div className="navigation-group"><button className="navigation-item navigation-item--group" type="button" onClick={onToggle} aria-expanded={expanded}>{label}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>{expanded && <div className="navigation-group__children">{children}</div>}</div>;
}

/** Renders a non-navigable placeholder until the corresponding workspace is designed. */
function NavigationPlaceholder({ label }: { label: string }) {
  return <span className="navigation-placeholder">{label}</span>;
}
