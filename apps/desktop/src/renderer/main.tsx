import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { Panel, Metric, StatusDot } from "./components/Primitive.js";
import { useNetworkStore } from "./stores/network.js";
import "./styles.css";

/** Renders the primary network confidence dashboard for the desktop client. */
function App() {
  const { status, state, error, lastUpdatedAt, refresh } = useNetworkStore();

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const connected = state === "connected";
  const tone = connected ? "good" : state === "connecting" ? "warn" : state === "error" ? "bad" : "neutral";

  return (
    <main>
      <header className="page-header">
        <div><p className="eyebrow">Peer Hours</p><h1>Network status</h1><p className="muted">A clear view of your connection to the timebank network.</p></div>
        <div className="connection-pill"><StatusDot tone={tone} /><span>{connected ? "Connected" : state === "connecting" ? "Connecting" : state === "error" ? "Connection issue" : "Not connected"}</span></div>
      </header>
      <div className="dashboard-grid">
        <Panel className="panel--wide"><div className="panel-heading"><div><span className="kicker">Local peer</span><h2 className="node-id">{status?.peerId ?? "Waiting for peer"}</h2></div><button onClick={() => void refresh()}>Refresh</button></div>{error ? <p className="error-message">{error}. The embedded peer could not be reached.</p> : <div className="metrics"><Metric label="Local peer" value={connected ? "Online" : "Offline"} detail={lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "No update yet"} /><Metric label="Network peers" value={status?.peers.length ?? 0} detail="other remote peers" /><Metric label="Replication" value={status?.replication.length ?? 0} detail="events available" /></div>}</Panel>
        <Panel><div className="panel-heading"><div><span className="kicker">Network peers</span><h2>Connected elsewhere</h2></div><span className="count-badge">{status?.peers.length ?? 0}</span></div>{status?.peers.length ? <ul className="peer-list">{status.peers.map((peer) => <li key={peer.id}><StatusDot tone="good" /><div><strong>{peer.id.slice(0, 16)}…</strong><span>Connected {new Date(peer.connectedAt).toLocaleTimeString()}</span></div></li>)}</ul> : <p className="empty-state">The node connection is active, but no other remote peers are connected yet.</p>}</Panel>
        <Panel><span className="kicker">What to expect</span><h2>Connection confidence</h2><p className="muted">This view will grow to show sync progress, retry timing, replication lag, and conflicts as the network protocol develops.</p></Panel>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
