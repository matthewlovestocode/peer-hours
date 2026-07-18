import type { PeerStatus } from "../../status.js";
import { StatusDot } from "../Primitive.js";
import { formatAge, lifecycleLabel, lifecycleTone } from "./peerPresentation.js";

type PeerRowProps = { peer: PeerStatus; selected: boolean; onSelect: () => void };

/** Renders one selectable peer result while preserving a native button interaction boundary. */
export function PeerRow({ peer, selected, onSelect }: PeerRowProps) {
  return (
    <li>
      <button className={`peer-row ${selected ? "peer-row--selected" : ""}`} type="button" onClick={onSelect} aria-pressed={selected}>
        <StatusDot tone={lifecycleTone(peer.lifecycleState)} />
        <span>
          <strong>{peer.id.slice(0, 20)}…</strong>
          <small>{lifecycleLabel(peer.lifecycleState)} · seen {formatAge(peer.lastSeenAt)}</small>
        </span>
        <span className="peer-row__chevron" aria-hidden="true">›</span>
      </button>
    </li>
  );
}
