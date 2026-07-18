export type PeerStatus = {
  id: string;
  connectedAt: string;
  lastSeenAt: string;
  lifecycleState: "discovered" | "connecting" | "connected" | "stale" | "offline";
  source?: "hyperswarm" | "simulated";
};

export type NodeStatus = {
  status: "online";
  nodeId: string;
  uptimeSeconds: number;
  swarm: { listening: boolean; peerCount: number };
  replication: { coreKey: string; length: number };
  peers: PeerStatus[];
};

export type LocalPeerStatus = {
  state: "starting" | "online" | "error";
  peerId: string;
  listening: boolean;
  peers: PeerStatus[];
  replication: { coreKey: string; length: number };
  error: string | null;
};
