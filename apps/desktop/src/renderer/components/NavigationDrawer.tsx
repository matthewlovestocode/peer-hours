import type { WorkspaceId } from "../stores/navigation.js";
import { NavigationButton } from "./navigation/NavigationButton.js";

type NavigationDrawerProps = {
  activeWorkspace: WorkspaceId;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (workspace: WorkspaceId) => void;
};

/** Presents the application's expandable left navigation without coupling it to feature data. */
export function NavigationDrawer({ activeWorkspace, isOpen, onClose, onNavigate }: NavigationDrawerProps) {
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
          <NavigationButton active={activeWorkspace === "home"} label="Welcome" onClick={() => onNavigate("home")} />
          <NavigationButton active={activeWorkspace === "activity"} label="My activity" onClick={() => onNavigate("activity")} />
          <NavigationButton active={activeWorkspace === "history"} label="My history" onClick={() => onNavigate("history")} />
          <NavigationButton active={activeWorkspace === "network"} label="Network" onClick={() => onNavigate("network")} />
        </nav>
        <p className="navigation-drawer__footer">Your activity is kept on this device and shared directly with your community when connections are available.</p>
      </aside>
    </>
  );
}
