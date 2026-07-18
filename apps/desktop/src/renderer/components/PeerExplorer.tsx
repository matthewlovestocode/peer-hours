import { useMemo, useState } from "react";
import type { LocalPeerStatus, PeerStatus } from "@peer-hours/peer-runtime";
import { Panel, StatusDot } from "./Primitive.js";

/** Presents a searchable peer list with a focused connection detail view. */
export function PeerExplorer({ status }: { status: LocalPeerStatus | null }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const peers = status?.peers ?? [];
  const filteredPeers = useMemo(() => peers.filter((peer) => peer.id.toLowerCase().includes(query.toLowerCase())), [peers, query]);
  const selectedPeer = peers.find((peer) => peer.id === selectedId) ?? filteredPeers[0] ?? null;

  return (
    <div className="peer-explorer">
      <Panel className="peer-list-panel"><div className="panel-heading"><div><span className="kicker">Peer explorer</span><h2>{peers.length} connected</h2></div><span className="count-badge">{filteredPeers.length}</span></div><input className="peer-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search peer identity" aria-label="Search peers" />{filteredPeers.length ? <ul className="peer-list peer-list--explorer">{filteredPeers.map((peer) => <PeerRow key={peer.id} peer={peer} selected={peer.id === selectedPeer?.id} onSelect={() => setSelectedId(peer.id)} />)}</ul> : <p className="empty-state">No peers match this search.</p>}</Panel>
      <Panel className="peer-detail-panel">{selectedPeer ? <PeerDetails peer={selectedPeer} /> : <div className="peer-detail-empty"><span className="kicker">Peer details</span><h2>Select a peer</h2><p className="muted">Choose a peer to inspect its identity, connection state, and source.</p></div>}</Panel>
    </div>
  );
}

/** Renders one selectable peer row in the explorer list. */
function PeerRow({ peer, selected, onSelect }: { peer: PeerStatus; selected: boolean; onSelect: () => void }) {
  return <li><button className={`peer-row ${selected ? "peer-row--selected" : ""}`} onClick={onSelect}><StatusDot tone="good" /><span><strong>{peer.id.slice(0, 20)}…</strong><small>{peer.source === "simulated" ? "Simulated peer" : "Remote peer"}</small></span><span className="peer-row__chevron">›</span></button></li>;
}

/** Renders detailed connection metadata for the currently selected peer. */
function PeerDetails({ peer }: { peer: PeerStatus }) {
  return <div><div className="panel-heading"><div><span className="kicker">Peer details</span><h2>{peer.source === "simulated" ? "Simulated peer" : "Remote peer"}</h2></div><StatusDot tone="good" /></div><dl className="peer-details"><div><dt>Identity</dt><dd>{peer.id}</dd></div><div><dt>Status</dt><dd>Connected</dd></div><div><dt>Source</dt><dd>{peer.source === "simulated" ? "Development simulator" : "Hyperswarm"}</dd></div><div><dt>Connected since</dt><dd>{new Date(peer.connectedAt).toLocaleString()}</dd></div><div><dt>Last seen</dt><dd>{new Date(peer.lastSeenAt).toLocaleString()}</dd></div></dl></div>;
}
