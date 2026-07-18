import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import { NetworkTree } from "../NetworkTree.js";
import { Panel } from "../Primitive.js";

/** Presents topology separately from connection controls and scalar diagnostics. */
export function NetworkTopology({ status, livePeerCount }: { status: LocalPeerStatus | null; livePeerCount: number }) {
  return (
    <Panel className="tree-panel">
      <div className="panel-heading">
        <div>
          <span className="kicker">{status?.community?.communityId ?? "Community network"}</span>
          <h2>{status?.community?.displayName ?? "One connected tree"}</h2>
        </div>
        <span className="tree-caption">{livePeerCount} live peers</span>
      </div>
      <NetworkTree status={status} />
    </Panel>
  );
}
