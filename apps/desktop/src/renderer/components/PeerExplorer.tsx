import { useEffect, useMemo, useState } from "react";
import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import type { PeerStatus } from "../status.js";
import { Panel, StatusDot } from "./Primitive.js";

/** Presents a searchable peer list with a focused connection detail view. */
export function PeerExplorer({ status }: { status: LocalPeerStatus | null }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const peers = status?.peers ?? [];
  const livePeers = peers.filter((peer) => peer.lifecycleState === "connected" || peer.lifecycleState === "connecting");
  const filteredPeers = useMemo(() => peers.filter((peer) => peer.id.toLowerCase().includes(query.toLowerCase())), [peers, query]);
  const selectedPeer = peers.find((peer) => peer.id === selectedId) ?? filteredPeers[0] ?? null;

  useEffect(() => {
    if (selectedId && !peers.some((peer) => peer.id === selectedId)) setSelectedId(null);
  }, [peers, selectedId]);

  return (
    <div className="peer-explorer">
      <Panel className="peer-list-panel"><div className="panel-heading"><div><span className="kicker">Peer explorer</span><h2>{livePeers.length} live {livePeers.length === 1 ? "peer" : "peers"}</h2></div><span className="count-badge">{filteredPeers.length}</span></div><input className="peer-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search peer identity" aria-label="Search peers" />{filteredPeers.length ? <ul className="peer-list peer-list--explorer">{filteredPeers.map((peer) => <PeerRow key={peer.id} peer={peer} selected={peer.id === selectedPeer?.id} onSelect={() => setSelectedId(peer.id)} />)}</ul> : <p className="empty-state">No peers match this search.</p>}</Panel>
      <Panel className="peer-detail-panel">{selectedPeer ? <PeerDetails peer={selectedPeer} /> : <div className="peer-detail-empty"><span className="kicker">Peer details</span><h2>Select a peer</h2><p className="muted">Choose a peer to inspect its identity, connection state, and source.</p></div>}</Panel>
    </div>
  );
}

/** Renders one selectable peer row in the explorer list. */
function PeerRow({ peer, selected, onSelect }: { peer: PeerStatus; selected: boolean; onSelect: () => void }) {
  return <li><button className={`peer-row ${selected ? "peer-row--selected" : ""}`} onClick={onSelect}><StatusDot tone={lifecycleTone(peer.lifecycleState)} /><span><strong>{peer.id.slice(0, 20)}…</strong><small>{lifecycleLabel(peer.lifecycleState)} · seen {formatAge(peer.lastSeenAt)}</small></span><span className="peer-row__chevron">›</span></button></li>;
}

/** Renders detailed connection metadata for the currently selected peer. */
function PeerDetails({ peer }: { peer: PeerStatus }) {
  return <div><div className="panel-heading"><div><span className="kicker">Peer details</span><h2>{peer.source === "simulated" ? "Simulated peer" : "Remote peer"}</h2></div><StatusDot tone={lifecycleTone(peer.lifecycleState)} /></div><dl className="peer-details"><div><dt>Identity</dt><dd>{peer.id}</dd></div><div><dt>Connection</dt><dd>{lifecycleLabel(peer.lifecycleState)} · seen {formatAge(peer.lastSeenAt)}</dd></div><div><dt>Source</dt><dd>{peer.source === "simulated" ? "Development simulator" : "Hyperswarm"}</dd></div><div><dt>Connected since</dt><dd>{new Date(peer.connectedAt).toLocaleString()}</dd></div><div><dt>Last seen</dt><dd>{new Date(peer.lastSeenAt).toLocaleString()}</dd></div></dl></div>;
}

/** Maps a peer lifecycle state to the visual tone used by the status indicator. */
function lifecycleTone(state: PeerStatus["lifecycleState"]): "good" | "warn" | "bad" | "neutral" {
  if (state === "connected") return "good";
  if (state === "stale" || state === "connecting") return "warn";
  if (state === "offline") return "bad";
  return "neutral";
}

/** Converts a protocol lifecycle state into concise user-facing language. */
function lifecycleLabel(state: PeerStatus["lifecycleState"]): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

/** Formats the elapsed time since a peer last reported activity. */
function formatAge(timestamp: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
