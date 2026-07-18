import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./components/AppShell.js";
import { NavigationDrawer } from "./components/NavigationDrawer.js";
import { HomePage } from "./pages/HomePage.js";
import { NetworkPage } from "./pages/NetworkPage.js";
import { useNavigationStore } from "./stores/navigation.js";
import "./styles.css";

/** Renders the application shell and selects the currently active workspace. */
function App() {
  const { activeWorkspace, drawerOpen, closeDrawer, setActiveWorkspace, toggleDrawer } = useNavigationStore();
  return <AppShell drawerOpen={drawerOpen} onToggleDrawer={toggleDrawer}><NavigationDrawer activeWorkspace={activeWorkspace} isOpen={drawerOpen} onClose={closeDrawer} onNavigate={setActiveWorkspace} />{activeWorkspace === "network" ? <NetworkPage /> : <HomePage />}</AppShell>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
