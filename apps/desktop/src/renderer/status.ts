/** Describes one discovered or connected remote peer for renderer-only presentation. */
export type PeerStatus = {
  id: string;
  connectedAt: string;
  lastSeenAt: string;
  lifecycleState: "discovered" | "connecting" | "connected" | "stale" | "offline";
  source?: "hyperswarm" | "simulated";
};

/** Describes the legacy node diagnostics payload retained for compatible renderer consumers. */
export type NodeStatus = {
  status: "online";
  nodeId: string;
  uptimeSeconds: number;
  swarm: { listening: boolean; peerCount: number };
  replication: { coreKey: string; length: number };
  peers: PeerStatus[];
};

/** Describes the local runtime status shape consumed by desktop diagnostics components. */
export type LocalPeerStatus = {
  state: "starting" | "online" | "error";
  peerId: string;
  listening: boolean;
  discovery: { connecting: number; connected: number };
  peers: PeerStatus[];
  replication: { coreKey: string; length: number };
  error: string | null;
};
