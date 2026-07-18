import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import { LocalRuntimeUptime } from "../LocalRuntimeUptime.js";
import { Metric, Panel } from "../Primitive.js";

type NetworkMetricsProps = {
  status: LocalPeerStatus | null;
  connected: boolean;
  livePeerCount: number;
  error: string | null;
  lastUpdatedAt: string | null;
  onRefresh: () => Promise<void>;
};

/** Displays current runtime, discovery, and feed metrics without owning network transport. */
export function NetworkMetrics({
  status,
  connected,
  livePeerCount,
  error,
  lastUpdatedAt,
  onRefresh,
}: NetworkMetricsProps) {
  return (
    <Panel className="status-strip">
      <div className="status-strip__identity">
        <span className="kicker">Your peer</span>
        <code className="node-id">{status?.peerId ?? "Waiting for peer"}</code>
        <button type="button" onClick={() => void onRefresh()}>Refresh</button>
      </div>
      {error ? (
        <p className="error-message">{error}. The embedded peer could not be reached.</p>
      ) : (
        <div className="metrics">
          <Metric label="Local peer" value={connected ? "Online" : "Offline"} detail={formatLastUpdated(lastUpdatedAt)} />
          <LocalRuntimeUptime status={status} />
          <Metric label="Community peers" value={status?.community?.communityNodeUrl ? 1 : 0} detail={status?.community?.communityNodeUrl ?? "No community peer configured"} />
          <Metric label="Live peers" value={livePeerCount} detail="remote peer connections" />
          <Metric label="Discovery" value={status ? `${status.discovery.connecting} / ${status.discovery.connected}` : "0 / 0"} detail="connecting / encrypted" />
          <Metric label="Replicated events" value={status?.memberFeed.length ?? 0} detail="in your member feed" />
        </div>
      )}
    </Panel>
  );
}

/** Formats status freshness for the metric without exposing an invalid timestamp to the UI. */
function formatLastUpdated(lastUpdatedAt: string | null): string {
  return lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "No update yet";
}
