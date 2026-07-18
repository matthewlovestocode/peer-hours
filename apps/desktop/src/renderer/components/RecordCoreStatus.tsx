import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import { Metric, Panel, StatusDot } from "./Primitive.js";

/** Presents this peer's independently owned member-feed availability without exposing record contents. */
export function RecordCoreStatus({ memberFeed }: { memberFeed: LocalPeerStatus["memberFeed"] | undefined }) {
  const unavailable = memberFeed === undefined || memberFeed.state === "unavailable";
  const tone = unavailable ? "warn" : "good";
  const sourceLabel = memberFeedSourceLabel(memberFeed?.state);

  return (
    <Panel className="record-core-panel">
      <div className="panel-heading">
        <div>
          <span className="kicker">Your member feed</span>
          <h2>{unavailable ? "Member feed unavailable" : "Member feed ready"}</h2>
        </div>
        <div className="record-core-panel__state"><StatusDot tone={tone} /><span>{sourceLabel}</span></div>
      </div>
      {unavailable ? (
        <p className="empty-state">This peer has not opened its local member feed yet. Network connectivity can be healthy while member data is unavailable.</p>
      ) : (
        <div className="record-core-panel__metrics">
          <Metric label="Your records" value={memberFeed.length} detail="immutable records in your local feed" />
          <div className="record-core-key">
            <span className="metric__label">Member feed key</span>
            <code>{memberFeed.coreKey}</code>
            <span className="metric__detail">Public identity of your append-only member feed</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Converts member-feed readiness into concise diagnostic language for the network workspace. */
function memberFeedSourceLabel(state: LocalPeerStatus["memberFeed"]["state"] | undefined): string {
  if (state === "ready") return "Owned by this peer";
  return "Not available";
}
