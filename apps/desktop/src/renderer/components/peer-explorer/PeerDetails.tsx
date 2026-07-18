import type { PeerStatus } from "../../status.js";
import { StatusDot } from "../Primitive.js";
import { formatAge, lifecycleLabel, lifecycleTone } from "./peerPresentation.js";

/** Renders connection metadata for a peer selected in the adjacent explorer list. */
export function PeerDetails({ peer }: { peer: PeerStatus }) {
  return (
    <div>
      <div className="panel-heading">
        <div>
          <span className="kicker">Peer details</span>
          <h2>{peer.source === "simulated" ? "Simulated peer" : "Remote peer"}</h2>
        </div>
        <StatusDot tone={lifecycleTone(peer.lifecycleState)} />
      </div>
      <dl className="peer-details">
        <div><dt>Identity</dt><dd>{peer.id}</dd></div>
        <div><dt>Connection</dt><dd>{lifecycleLabel(peer.lifecycleState)} · seen {formatAge(peer.lastSeenAt)}</dd></div>
        <div><dt>Source</dt><dd>{peer.source === "simulated" ? "Development simulator" : "Hyperswarm"}</dd></div>
        <div><dt>Connected since</dt><dd>{new Date(peer.connectedAt).toLocaleString()}</dd></div>
        <div><dt>Last seen</dt><dd>{new Date(peer.lastSeenAt).toLocaleString()}</dd></div>
      </dl>
    </div>
  );
}
