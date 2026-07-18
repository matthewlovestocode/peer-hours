import { useEffect } from "react";
import { Metric, Panel, StatusDot } from "../components/Primitive.js";
import { NetworkTree } from "../components/NetworkTree.js";
import { PeerExplorer } from "../components/PeerExplorer.js";
import { useNetworkStore } from "../stores/network.js";

/** Renders the network diagnostics workspace outside of the desktop landing page. */
export function NetworkPage() {
  const { status, state, error, lastUpdatedAt, refresh, subscribe } = useNetworkStore();

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => subscribe(), [subscribe]);

  const connected = state === "connected";
  const tone = connected ? "good" : state === "connecting" ? "warn" : state === "error" ? "bad" : "neutral";
  const livePeerCount = status?.peers.filter((peer) => peer.lifecycleState === "connected" || peer.lifecycleState === "connecting").length ?? 0;

  return <section className="network-page"><header className="workspace-header"><div><p className="eyebrow">Network</p><h1>Connection status</h1><p className="muted">A clear view of your connection to the timebank network.</p></div><div className="connection-pill"><StatusDot tone={tone} /><span>{connected ? "Connected" : state === "connecting" ? "Connecting" : state === "error" ? "Connection issue" : "Not connected"}</span></div></header><Panel className="tree-panel"><div className="panel-heading"><div><span className="kicker">{status?.community?.communityId ?? "Community network"}</span><h2>{status?.community?.displayName ?? "One connected tree"}</h2></div><span className="tree-caption">{livePeerCount} live peers</span></div><NetworkTree status={status} /></Panel><Panel className="status-strip"><div className="status-strip__identity"><span className="kicker">Your peer</span><code className="node-id">{status?.peerId ?? "Waiting for peer"}</code><button onClick={() => void refresh()}>Refresh</button></div>{error ? <p className="error-message">{error}. The embedded peer could not be reached.</p> : <div className="metrics"><Metric label="Local peer" value={connected ? "Online" : "Offline"} detail={lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "No update yet"} /><Metric label="Community nodes" value={status?.bootstrap.state === "fetched" ? 1 : 0} detail={status?.bootstrap.url ?? "No community node configured"} /><Metric label="Live peers" value={livePeerCount} detail="remote peer connections" /><Metric label="Discovery" value={status ? `${status.discovery.connecting} / ${status.discovery.connected}` : "0 / 0"} detail="connecting / encrypted" /><Metric label="Replicated events" value={status?.replication.length ?? 0} detail="available locally" /></div>}</Panel><PeerExplorer status={status} /></section>;
}
