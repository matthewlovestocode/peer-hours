import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import { StatusDot } from "./Primitive.js";

/** Renders the local peer as a living tree with community and remote peer connections. */
export function NetworkTree({ status }: { status: LocalPeerStatus | null }) {
  const peers = status?.peers ?? [];
  const hasCommunityNode = status?.bootstrap.state === "fetched";
  const branchCount = Math.max(peers.length + (hasCommunityNode ? 1 : 0), 1);

  return (
    <div className="network-tree" aria-label="Peer Hours network tree">
      <svg className="network-tree__svg" viewBox="0 0 1000 430" role="img" aria-labelledby="tree-title tree-description">
        <title id="tree-title">Peer Hours community network</title>
        <desc id="tree-description">A local peer connected to a community node and remote peers.</desc>
        <defs>
          <linearGradient id="trunk-gradient" x1="0" x2="1">
            <stop offset="0" stopColor="#a3e635" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <filter id="tree-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <path className="tree-glow" d="M500 370 C500 290 500 210 500 130" />
        <path className="tree-trunk" d="M500 370 C500 290 500 210 500 130" />
        {hasCommunityNode && <path className="tree-branch tree-branch--active" d="M500 265 C620 250 700 205 760 130" />}
        {peers.map((peer, index) => {
          const x = 220 + ((index + (hasCommunityNode ? 1 : 0)) / branchCount) * 560;
          const y = 120 + (index % 2) * 44;
          return <path className="tree-branch tree-branch--active" d={`M500 270 C${x} 255 ${x} ${y + 30} ${x} ${y}`} key={`branch-${peer.id}`} />;
        })}
        <circle className="tree-node tree-node--local" cx="500" cy="370" r="30" />
        <circle className="tree-node__core" cx="500" cy="370" r="8" />
        {hasCommunityNode && <g><circle className="tree-node tree-node--community" cx="760" cy="130" r="24" /><circle className="tree-node__core" cx="760" cy="130" r="6" /></g>}
        {peers.map((peer, index) => {
          const x = 220 + ((index + (hasCommunityNode ? 1 : 0)) / branchCount) * 560;
          const y = 120 + (index % 2) * 44;
          return <g key={peer.id}><circle className={`tree-node tree-node--peer ${peer.source === "simulated" ? "tree-node--simulated" : ""}`} cx={x} cy={y} r="15" /><circle className="tree-node__core" cx={x} cy={y} r="4" /></g>;
        })}
      </svg>
      <div className="network-tree__labels">
        <div className="tree-label tree-label--local"><StatusDot tone={status?.state === "online" ? "good" : "warn"} /><span><strong>Your peer</strong><small>{status?.peerId ? `${status.peerId.slice(0, 14)}…` : "Starting local runtime"}</small></span></div>
        {hasCommunityNode && <div className="tree-label tree-label--community"><StatusDot tone="good" /><span><strong>{status?.community?.displayName ?? "Community node"}</strong><small>Community metadata fetched</small></span></div>}
        {!peers.length && <div className="tree-label tree-label--hint"><span><strong>Waiting for peers</strong><small>Live connections will grow from here</small></span></div>}
      </div>
    </div>
  );
}
