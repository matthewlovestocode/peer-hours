import { useState } from "react";
import type { WorkspaceId } from "../stores/navigation.js";
import { NavigationButton } from "./navigation/NavigationButton.js";
import { NavigationGroup } from "./navigation/NavigationGroup.js";
import { NavigationPlaceholder } from "./navigation/NavigationPlaceholder.js";

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

  return (
    <>
      <button
        className={`drawer-scrim ${isOpen ? "drawer-scrim--visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
      />
      <aside className={`navigation-drawer ${isOpen ? "navigation-drawer--open" : ""}`} id="app-navigation" aria-hidden={!isOpen}>
        <div className="navigation-drawer__header">
          <span className="kicker">Navigation</span>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close navigation">×</button>
        </div>
        <nav aria-label="Primary navigation">
          <NavigationButton active={activeWorkspace === "home"} label="Home" onClick={() => onNavigate("home")} />
          <NavigationButton active={activeWorkspace === "records"} label="My records" onClick={() => onNavigate("records")} />
          <NavigationGroup expanded={communityOpen} label="Community" onToggle={() => setCommunityOpen((open) => !open)}>
            <NavigationPlaceholder label="Overview" />
            <NavigationPlaceholder label="People" />
          </NavigationGroup>
          <NavigationGroup expanded={exchangeOpen} label="Exchange" onToggle={() => setExchangeOpen((open) => !open)}>
            <NavigationPlaceholder label="Offers" />
            <NavigationPlaceholder label="Requests" />
          </NavigationGroup>
          <NavigationButton active={activeWorkspace === "network"} label="Network" onClick={() => onNavigate("network")} />
        </nav>
        <p className="navigation-drawer__footer">More sections can be added here as the product takes shape.</p>
      </aside>
    </>
  );
}
