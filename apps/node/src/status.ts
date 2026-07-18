export type PeerStatus = {
  id: string;
  connectedAt: string;
  lastSeenAt: string;
  lifecycleState: "discovered" | "connecting" | "connected" | "stale" | "offline";
};

export type NodeStatus = {
  status: "online";
  nodeId: string;
  uptimeSeconds: number;
  swarm: {
    listening: boolean;
    peerCount: number;
  };
  replication: {
    coreKey: string;
    length: number;
  };
  peers: PeerStatus[];
};

export function createNodeStatus(input: {
  nodeId: string;
  startedAt: number;
  listening: boolean;
  coreKey: string;
  coreLength: number;
  peers: Map<string, PeerStatus>;
}): NodeStatus {
  return {
    status: "online",
    nodeId: input.nodeId,
    uptimeSeconds: Math.floor((Date.now() - input.startedAt) / 1000),
    swarm: {
      listening: input.listening,
      peerCount: input.peers.size,
    },
    replication: {
      coreKey: input.coreKey,
      length: input.coreLength,
    },
    peers: [...input.peers.values()],
  };
}
