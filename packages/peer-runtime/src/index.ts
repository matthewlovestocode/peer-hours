import { mkdir } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import Corestore from "corestore";
import Hyperswarm from "hyperswarm";

export type PeerStatus = {
  id: string;
  connectedAt: string;
  lastSeenAt: string;
  source?: "hyperswarm" | "simulated";
};

export type LocalPeerStatus = {
  state: "starting" | "online" | "error";
  peerId: string;
  listening: boolean;
  peers: PeerStatus[];
  replication: { coreKey: string; length: number };
  error: string | null;
  bootstrap: { url: string | null; state: "not-configured" | "fetching" | "fetched" | "error" };
  community: CommunityManifest | null;
};

export type CommunityManifest = {
  communityId: string;
  displayName: string;
  protocolVersion: number;
  coreKey: string;
  bootstrapNodes: string[];
};

type PeerConnection = { on: Function; remotePublicKey?: Buffer };

/** Owns a local Peer Hours identity, persistent store, and Hyperswarm connections. */
export class PeerRuntime {
  private readonly dataDirectory: string;
  private readonly bootstrapKey: Buffer | null;
  private readonly bootstrapUrl: string | null;
  private store: any;
  private core: any;
  private bootstrapCore: any;
  private swarm: any;
  private listening = false;
  private error: string | null = null;
  private bootstrapState: LocalPeerStatus["bootstrap"]["state"] = "not-configured";
  private community: CommunityManifest | null = null;
  private communityPeers: PeerStatus[] = [];
  private statusTimer: NodeJS.Timeout | null = null;
  private readonly peers = new Map<string, PeerStatus>();

  /** Creates a peer runtime using an app-owned data directory and optional bootstrap core. */
  constructor(dataDirectory: string, bootstrapKey?: string, bootstrapUrl?: string) {
    this.dataDirectory = dataDirectory;
    this.bootstrapKey = bootstrapKey ? Buffer.from(bootstrapKey, "hex") : null;
    this.bootstrapUrl = bootstrapUrl ?? null;
  }

  /** Starts local storage and peer discovery, then accepts replicated connections. */
  async start(): Promise<void> {
    try {
      await mkdir(this.dataDirectory, { recursive: true });
      this.store = new Corestore(this.dataDirectory);
      this.core = this.store.get({ name: "peer-hours-network", valueEncoding: "json" });
      await this.core.ready();
      this.swarm = new Hyperswarm();
      this.swarm.on("connection", (connection: PeerConnection) => {
        this.store.replicate(connection);
        const id = connection.remotePublicKey?.toString("hex") ?? `peer-${this.peers.size + 1}`;
        const now = new Date().toISOString();
        this.peers.set(id, { id, connectedAt: now, lastSeenAt: now, source: "hyperswarm" });
        connection.on("close", () => this.peers.delete(id));
      });
      void this.swarm.listen().then(() => { this.listening = true; });
      this.join(this.core.discoveryKey);
      if (this.bootstrapKey) this.bootstrapState = "fetched";
      const bootstrapKey = this.bootstrapKey ?? await this.fetchBootstrapKey();
      if (bootstrapKey) {
        this.bootstrapCore = this.store.get({ key: bootstrapKey, valueEncoding: "json" });
        await this.bootstrapCore.ready();
        this.join(this.bootstrapCore.discoveryKey);
      }
      if (this.bootstrapUrl) {
        this.statusTimer = setInterval(() => void this.refreshCommunityPeers(), 2_000);
        void this.refreshCommunityPeers();
      }
      void this.swarm.flush().catch((cause: unknown) => {
        console.error("peer discovery flush failed:", cause);
      });
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Unable to start local peer";
      throw cause;
    }
  }

  /** Registers a development-only simulated peer for UI and topology testing. */
  registerSimulatedPeer(id: string): void {
    const now = new Date().toISOString();
    this.peers.set(id, { id, connectedAt: now, lastSeenAt: now, source: "simulated" });
  }

  /** Removes a development-only simulated peer from the status view. */
  unregisterSimulatedPeer(id: string): void {
    this.peers.delete(id);
  }

  /** Fetches a public network key from the configured bootstrap endpoint. */
  private async fetchBootstrapKey(): Promise<Buffer | null> {
    if (!this.bootstrapUrl) return null;
    this.bootstrapState = "fetching";
    try {
      console.log(`fetching bootstrap metadata from ${this.bootstrapUrl}`);
      const payload = await this.requestJson<CommunityManifest>(this.bootstrapUrl);
      if (!payload.coreKey) throw new Error("Bootstrap response did not include a core key");
      this.community = payload;
      this.bootstrapState = "fetched";
      console.log("bootstrap metadata received");
      return Buffer.from(payload.coreKey, "hex");
    } catch (cause) {
      this.bootstrapState = "error";
      this.error = cause instanceof Error ? cause.message : "Unable to reach bootstrap node";
      console.error("bootstrap failed:", cause);
      return null;
    }
  }

  /** Reads the community node's peer roster for development visibility and diagnostics. */
  private async refreshCommunityPeers(): Promise<void> {
    if (!this.bootstrapUrl) return;
    try {
      const statusUrl = this.bootstrapUrl.replace(/\/bootstrap$/, "/status");
      const payload = await this.requestJson<{ peers?: PeerStatus[] }>(statusUrl);
      this.communityPeers = (payload.peers ?? []).map((peer) => ({ ...peer, source: peer.source ?? "hyperswarm" }));
    } catch {
      this.communityPeers = [];
    }
  }

  /** Fetches and parses bootstrap JSON using Node's HTTP client in any host process. */
  private requestJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = new URL(url).protocol === "https:" ? httpsGet : httpGet;
      request(url, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(new Error(`Bootstrap returned ${response.statusCode ?? "unknown status"}`));
            return;
          }
          try { resolve(JSON.parse(body) as T); } catch { reject(new Error("Bootstrap returned invalid JSON")); }
        });
      }).on("error", reject);
    });
  }

  /** Joins a discovery topic and attaches replication handling for new connections. */
  private join(topic: Buffer): void {
    this.swarm.join(topic, { server: true, client: true });
  }

  /** Returns a serializable snapshot for desktop UIs, node APIs, and diagnostics. */
  status(): LocalPeerStatus {
    const expiry = Date.now() - 10_000;
    for (const [id, peer] of this.peers) {
      if (peer.source === "simulated" && Date.parse(peer.lastSeenAt) < expiry) this.peers.delete(id);
    }
    return {
      state: this.error ? "error" : this.core ? "online" : "starting",
      peerId: this.core?.key?.toString("hex") ?? "",
      listening: this.listening,
      peers: [...this.peers.values(), ...this.communityPeers.filter((peer) => !this.peers.has(peer.id))],
      replication: { coreKey: this.core?.key?.toString("hex") ?? "", length: this.core?.length ?? 0 },
      error: this.error,
      bootstrap: { url: this.bootstrapUrl, state: this.bootstrapState },
      community: this.community,
    };
  }

  /** Stops discovery and closes local storage during application shutdown. */
  async stop(): Promise<void> {
    if (this.statusTimer) clearInterval(this.statusTimer);
    if (this.swarm) await this.swarm.destroy();
    if (this.store) await this.store.close();
  }
}
