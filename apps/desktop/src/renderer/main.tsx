import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./components/AppShell.js";
import { NavigationDrawer } from "./components/NavigationDrawer.js";
import { ActivityPage } from "./pages/ActivityPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { HomePage } from "./pages/HomePage.js";
import { NetworkPage } from "./pages/NetworkPage.js";
import { OfferCreationPage } from "./pages/OfferCreationPage.js";
import { RequestCreationPage } from "./pages/RequestCreationPage.js";
import { useNavigationStore } from "./stores/navigation.js";
import "./styles.css";

/** Renders the application shell and selects the currently active workspace. */
function App() {
  const { activeWorkspace, drawerOpen, closeDrawer, setActiveWorkspace, toggleDrawer } = useNavigationStore();
  return <AppShell drawerOpen={drawerOpen} onToggleDrawer={toggleDrawer}><NavigationDrawer activeWorkspace={activeWorkspace} isOpen={drawerOpen} onClose={closeDrawer} onNavigate={setActiveWorkspace} />{activeWorkspace === "network" ? <NetworkPage /> : activeWorkspace === "create-offer" ? <OfferCreationPage onCancel={() => setActiveWorkspace("activity")} onPublished={() => setActiveWorkspace("activity")} /> : activeWorkspace === "create-request" ? <RequestCreationPage onCancel={() => setActiveWorkspace("activity")} onPublished={() => setActiveWorkspace("activity")} /> : activeWorkspace === "activity" ? <ActivityPage onOpenWelcome={() => setActiveWorkspace("home")} onCreateOffer={() => setActiveWorkspace("create-offer")} onCreateRequest={() => setActiveWorkspace("create-request")} /> : activeWorkspace === "history" ? <HistoryPage /> : <HomePage onOpenActivity={() => setActiveWorkspace("activity")} />}</AppShell>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
