import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import { Metric, Panel, StatusDot } from "./Primitive.js";

/** Presents the local runtime's immutable timebank record-core availability without exposing record contents. */
export function RecordCoreStatus({ records }: { records: LocalPeerStatus["records"] | undefined }) {
  const unavailable = records === undefined || records.state === "unavailable";
  const tone = unavailable ? "warn" : "good";
  const sourceLabel = recordCoreSourceLabel(records?.state);

  return (
    <Panel className="record-core-panel">
      <div className="panel-heading">
        <div>
          <span className="kicker">Timebank records</span>
          <h2>{unavailable ? "Record core unavailable" : "Record core available"}</h2>
        </div>
        <div className="record-core-panel__state"><StatusDot tone={tone} /><span>{sourceLabel}</span></div>
      </div>
      {unavailable ? (
        <p className="empty-state">This peer has not opened a local or community record core yet. Network connectivity can be healthy while timebank records are unavailable.</p>
      ) : (
        <div className="record-core-panel__metrics">
          <Metric label="Available records" value={records.length} detail="immutable records available locally" />
          <div className="record-core-key">
            <span className="metric__label">Record core key</span>
            <code>{records.coreKey}</code>
            <span className="metric__detail">Public identity of this append-only community record core</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Converts record-core ownership into concise diagnostic language for the network workspace. */
function recordCoreSourceLabel(state: LocalPeerStatus["records"]["state"] | undefined): string {
  if (state === "community") return "Community record core";
  if (state === "local") return "Local record core";
  return "Not available";
}
