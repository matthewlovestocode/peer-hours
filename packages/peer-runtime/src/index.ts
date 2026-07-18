import { mkdir } from "node:fs/promises";
import Corestore from "corestore";
import Hyperswarm from "hyperswarm";

export type PeerStatus = {
  id: string;
  connectedAt: string;
  lastSeenAt: string;
};

export type LocalPeerStatus = {
  state: "starting" | "online" | "error";
  peerId: string;
  listening: boolean;
  peers: PeerStatus[];
  replication: { coreKey: string; length: number };
  error: string | null;
};

type PeerConnection = { on: Function; remotePublicKey?: Buffer };

/** Owns a local Peer Hours identity, persistent store, and Hyperswarm connections. */
export class PeerRuntime {
  private readonly dataDirectory: string;
  private readonly bootstrapKey: Buffer | null;
  private store: any;
  private core: any;
  private swarm: any;
  private listening = false;
  private error: string | null = null;
  private readonly peers = new Map<string, PeerStatus>();

  /** Creates a peer runtime using an app-owned data directory and optional bootstrap core. */
  constructor(dataDirectory: string, bootstrapKey?: string) {
    this.dataDirectory = dataDirectory;
    this.bootstrapKey = bootstrapKey ? Buffer.from(bootstrapKey, "hex") : null;
  }

  /** Starts local storage and peer discovery, then accepts replicated connections. */
  async start(): Promise<void> {
    try {
      await mkdir(this.dataDirectory, { recursive: true });
      this.store = new Corestore(this.dataDirectory);
      this.core = this.store.get({ name: "peer-hours-network", valueEncoding: "json" });
      await this.core.ready();
      this.swarm = new Hyperswarm();
      void this.swarm.listen().then(() => { this.listening = true; });
      this.join(this.core.discoveryKey);
      if (this.bootstrapKey) this.join(this.bootstrapKey);
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Unable to start local peer";
      throw cause;
    }
  }

  /** Joins a discovery topic and attaches replication handling for new connections. */
  private join(topic: Buffer): void {
    this.swarm.join(topic, { server: true, client: true });
    this.swarm.on("connection", (connection: PeerConnection) => {
      this.store.replicate(connection);
      const id = connection.remotePublicKey?.toString("hex") ?? `peer-${this.peers.size + 1}`;
      const now = new Date().toISOString();
      this.peers.set(id, { id, connectedAt: now, lastSeenAt: now });
      connection.on("close", () => this.peers.delete(id));
    });
  }

  /** Returns a serializable snapshot for desktop UIs, node APIs, and diagnostics. */
  status(): LocalPeerStatus {
    return {
      state: this.error ? "error" : this.core ? "online" : "starting",
      peerId: this.core?.key?.toString("hex") ?? "",
      listening: this.listening,
      peers: [...this.peers.values()],
      replication: { coreKey: this.core?.key?.toString("hex") ?? "", length: this.core?.length ?? 0 },
      error: this.error,
    };
  }

  /** Stops discovery and closes local storage during application shutdown. */
  async stop(): Promise<void> {
    if (this.swarm) await this.swarm.destroy();
    if (this.store) await this.store.close();
  }
}
