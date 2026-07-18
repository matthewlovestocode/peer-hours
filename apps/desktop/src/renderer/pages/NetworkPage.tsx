import { useEffect } from "react";
import { PeerExplorer } from "../components/PeerExplorer.js";
import { RecordCoreStatus } from "../components/RecordCoreStatus.js";
import { NetworkHeader } from "../components/network/NetworkHeader.js";
import { NetworkMetrics } from "../components/network/NetworkMetrics.js";
import { NetworkTopology } from "../components/network/NetworkTopology.js";
import { useNetworkStore } from "../stores/network.js";

/** Renders the network diagnostics workspace with independently testable status sections. */
export function NetworkPage() {
  const { status, state, error, lastUpdatedAt, refresh, subscribe } = useNetworkStore();

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => subscribe(), [subscribe]);

  const connected = state === "connected";
  const livePeerCount = status?.peers.filter(isLivePeer).length ?? 0;

  return (
    <section className="network-page">
      <NetworkHeader connected={connected} state={state} />
      <NetworkTopology status={status} livePeerCount={livePeerCount} />
      <NetworkMetrics
        status={status}
        connected={connected}
        livePeerCount={livePeerCount}
        error={error}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={refresh}
      />
      <RecordCoreStatus memberFeed={status?.memberFeed} />
      <PeerExplorer status={status} />
    </section>
  );
}

/** Identifies peers that are presently connected or in the process of connecting. */
function isLivePeer(peer: { lifecycleState: string }): boolean {
  return peer.lifecycleState === "connected" || peer.lifecycleState === "connecting";
}
