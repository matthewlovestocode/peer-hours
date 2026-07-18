import { useEffect, useMemo, useState } from "react";
import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import { Panel } from "./Primitive.js";
import { PeerDetails } from "./peer-explorer/PeerDetails.js";
import { PeerRow } from "./peer-explorer/PeerRow.js";
import { isLivePeer } from "./peer-explorer/peerPresentation.js";

/** Presents a searchable peer list with a focused connection detail view. */
export function PeerExplorer({ status }: { status: LocalPeerStatus | null }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const peers = status?.peers ?? [];
  const livePeers = peers.filter(isLivePeer);
  const filteredPeers = useMemo(() => filterPeers(peers, query), [peers, query]);
  const selectedPeer = peers.find((peer) => peer.id === selectedId) ?? filteredPeers[0] ?? null;

  useEffect(() => {
    if (selectedId && !peers.some((peer) => peer.id === selectedId)) {
      setSelectedId(null);
    }
  }, [peers, selectedId]);

  return (
    <div className="peer-explorer">
      <Panel className="peer-list-panel">
        <div className="panel-heading">
          <div>
            <span className="kicker">Peer explorer</span>
            <h2>{livePeers.length} live {livePeers.length === 1 ? "peer" : "peers"}</h2>
          </div>
          <span className="count-badge">{filteredPeers.length}</span>
        </div>
        <input className="peer-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search peer identity" aria-label="Search peers" />
        {filteredPeers.length ? (
          <ul className="peer-list peer-list--explorer">
            {filteredPeers.map((peer) => (
              <PeerRow key={peer.id} peer={peer} selected={peer.id === selectedPeer?.id} onSelect={() => setSelectedId(peer.id)} />
            ))}
          </ul>
        ) : <p className="empty-state">No peers match this search.</p>}
      </Panel>
      <Panel className="peer-detail-panel">
        {selectedPeer ? <PeerDetails peer={selectedPeer} /> : <PeerDetailsEmptyState />}
      </Panel>
    </div>
  );
}

/** Explains how to select a peer when the current result set has no active selection. */
function PeerDetailsEmptyState() {
  return (
    <div className="peer-detail-empty">
      <span className="kicker">Peer details</span>
      <h2>Select a peer</h2>
      <p className="muted">Choose a peer to inspect its identity, connection state, and source.</p>
    </div>
  );
}

/** Narrows the visible peer list according to a case-insensitive identity query. */
function filterPeers<T extends { id: string }>(peers: T[], query: string): T[] {
  const normalizedQuery = query.toLowerCase();
  return peers.filter((peer) => peer.id.toLowerCase().includes(normalizedQuery));
}
