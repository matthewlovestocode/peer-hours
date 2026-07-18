import { mkdir } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import Corestore from "corestore";
import Hyperswarm from "hyperswarm";
import { HypercoreRecordStore, type JsonValue } from "./record-store.js";

export * from "./record-store.js";

export type PeerLifecycleState = "discovered" | "connecting" | "connected" | "stale" | "offline";

export type PeerStatus = {
  id: string;
  connectedAt: string;
  lastSeenAt: string;
  lifecycleState: PeerLifecycleState;
  source?: "hyperswarm" | "simulated";
};

export type LocalPeerStatus = {
  state: "starting" | "online" | "error";
  peerId: string;
  listening: boolean;
  discovery: { connecting: number; connected: number };
  peers: PeerStatus[];
  replication: { coreKey: string; length: number };
  records: { coreKey: string; length: number; state: "local" | "community" | "unavailable" };
  error: string | null;
  bootstrap: { url: string | null; state: "not-configured" | "fetching" | "fetched" | "error" };
  community: CommunityManifest | null;
};

export type CommunityManifest = {
  communityId: string;
  displayName: string;
  protocolVersion: number;
  coreKey: string;
  recordCoreKey?: string;
  bootstrapNodes: string[];
};

export type PeerStatusListener = (status: LocalPeerStatus) => void;

type PeerConnection = { on: Function; remotePublicKey?: Buffer };

/** Derives the user-visible lifecycle state from peer freshness and connection state. */
export function derivePeerLifecycleState(peer: PeerStatus, now = Date.now(), staleAfterMs = 10_000, offlineAfterMs = 30_000): PeerLifecycleState {
  if (peer.lifecycleState === "offline") return "offline";
  const age = now - Date.parse(peer.lastSeenAt);
  if (age >= offlineAfterMs) return "offline";
  if (age >= staleAfterMs && peer.lifecycleState === "connected") return "stale";
  return peer.lifecycleState;
}

/** Owns a local Peer Hours identity, persistent store, and Hyperswarm connections. */
export class PeerRuntime {
  private readonly dataDirectory: string;
  private readonly bootstrapKey: Buffer | null;
  private readonly bootstrapUrl: string | null;
  private readonly now: () => number;
  private readonly configuredRecordCoreKey: string | null;
  private readonly networkingEnabled: boolean;
  private store: any;
  private core: any;
  private recordStore: HypercoreRecordStore | null = null;
  private bootstrapCore: any;
  private swarm: any;
  private listening = false;
  private error: string | null = null;
  private bootstrapState: LocalPeerStatus["bootstrap"]["state"] = "not-configured";
  private community: CommunityManifest | null = null;
  private communityPeers: PeerStatus[] = [];
  private statusTimer: NodeJS.Timeout | null = null;
  private readonly peers = new Map<string, PeerStatus>();
  private readonly statusListeners = new Set<PeerStatusListener>();
  private readonly staleAfterMs = 10_000;
  private readonly offlineRetentionMs = 30_000;

  /** Creates a peer runtime using an app-owned data directory, optional bootstrap core, and clock. */
  constructor(
    dataDirectory: string,
    bootstrapKey?: string,
    bootstrapUrl?: string,
    now: () => number = Date.now,
    recordCoreKey?: string,
    networkingEnabled = true,
  ) {
    this.dataDirectory = dataDirectory;
    this.bootstrapKey = bootstrapKey ? Buffer.from(bootstrapKey, "hex") : null;
    this.bootstrapUrl = bootstrapUrl ?? null;
    this.now = now;
    this.configuredRecordCoreKey = recordCoreKey ?? null;
    this.networkingEnabled = networkingEnabled;
  }

  /** Subscribes to local and community status changes and returns an unsubscribe function. */
  onStatusChange(listener: PeerStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Publishes the current status to subscribers after a meaningful runtime change. */
  private notifyStatusChange(): void {
    const snapshot = this.status();
    for (const listener of this.statusListeners) listener(snapshot);
  }

  /** Starts local storage and peer discovery, then accepts replicated connections. */
  async start(): Promise<void> {
    try {
      await mkdir(this.dataDirectory, { recursive: true });
      this.store = new Corestore(this.dataDirectory);
      this.core = this.store.get({ name: "peer-hours-network", valueEncoding: "json" });
      await this.core.ready();
      const recordCoreKey = this.configuredRecordCoreKey ?? this.community?.recordCoreKey;
      this.recordStore = await HypercoreRecordStore.open(this.store, "peer-hours-timebank-records", recordCoreKey);
      if (this.networkingEnabled) {
        this.startNetworking();
      }
      if (this.bootstrapKey) this.bootstrapState = "fetched";
      const bootstrapKey = this.bootstrapKey ?? await this.fetchBootstrapKey();
      if (bootstrapKey) {
        this.bootstrapCore = this.store.get({ key: bootstrapKey, valueEncoding: "json" });
        await this.bootstrapCore.ready();
        if (this.networkingEnabled) this.join(this.bootstrapCore.discoveryKey);
      }
      await this.openCommunityRecordStore();
      if (this.bootstrapUrl) {
        this.statusTimer = setInterval(() => void this.refreshCommunityPeers(), 2_000);
        void this.refreshCommunityPeers();
      }
      if (this.networkingEnabled) {
        void this.swarm.flush().catch((cause: unknown) => {
          console.error("peer discovery flush failed:", cause);
        });
      }
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Unable to start local peer";
      throw cause;
    }
  }

  /** Starts Hyperswarm discovery and direct Corestore replication for a network-enabled runtime. */
  private startNetworking(): void {
    this.swarm = new Hyperswarm();
    this.swarm.on("connection", (connection: PeerConnection) => {
      const id = connection.remotePublicKey?.toString("hex") ?? `peer-${this.peers.size + 1}`;
      const now = new Date(this.now()).toISOString();
      this.peers.set(id, { id, connectedAt: now, lastSeenAt: now, lifecycleState: "connecting", source: "hyperswarm" });
      this.store.replicate(connection);
      queueMicrotask(() => {
        const peer = this.peers.get(id);
        if (peer?.lifecycleState === "connecting") {
          this.peers.set(id, { ...peer, lifecycleState: "connected", lastSeenAt: new Date(this.now()).toISOString() });
          this.notifyStatusChange();
        }
      });
      connection.on("close", () => {
        const peer = this.peers.get(id);
        if (peer) {
          this.peers.set(id, { ...peer, lifecycleState: "offline", lastSeenAt: new Date(this.now()).toISOString() });
          this.notifyStatusChange();
        }
      });
    });
    void this.swarm.listen().then(() => { this.listening = true; });
    this.join(this.core.discoveryKey);
  }

  /** Returns the public key for the active local or community-provided immutable record core. */
  get recordCoreKey(): string {
    return this.recordStore?.publicKey ?? "";
  }

  /** Reports whether this runtime owns the active record core and can append to it. */
  get canAppendRecords(): boolean {
    return this.recordStore?.writable ?? false;
  }

  /** Appends one immutable JSON record when this runtime owns the active record core. */
  async appendRecord(record: JsonValue): Promise<number> {
    if (this.recordStore === null) throw new Error("The record core is not ready.");
    if (!this.recordStore.writable) throw new Error("The active community record core is read-only.");
    const index = await this.recordStore.append(record);
    this.notifyStatusChange();
    return index;
  }

  /** Reads every immutable JSON record currently available from the active record core. */
  async readRecords(): Promise<readonly JsonValue[]> {
    return this.recordStore?.readAll() ?? Object.freeze([]);
  }

  /** Registers a development-only simulated peer for UI and topology testing. */
  registerSimulatedPeer(id: string): void {
    const now = new Date(this.now()).toISOString();
    const existing = this.peers.get(id);
    this.peers.set(id, { id, connectedAt: existing?.connectedAt ?? now, lastSeenAt: now, lifecycleState: "connected", source: "simulated" });
    this.notifyStatusChange();
  }

  /** Removes a development-only simulated peer from the status view. */
  unregisterSimulatedPeer(id: string): void {
    this.peers.delete(id);
    this.notifyStatusChange();
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

  /** Opens the configured community record core after bootstrap metadata becomes available. */
  private async openCommunityRecordStore(): Promise<void> {
    const recordCoreKey = this.configuredRecordCoreKey ?? this.community?.recordCoreKey;
    if (recordCoreKey === undefined || recordCoreKey === this.recordStore?.publicKey) return;
    this.recordStore = await HypercoreRecordStore.open(this.store, "peer-hours-timebank-records", recordCoreKey);
    this.notifyStatusChange();
  }

  /** Reads the community node's peer roster for development visibility and diagnostics. */
  private async refreshCommunityPeers(): Promise<void> {
    if (!this.bootstrapUrl) return;
    try {
      const statusUrl = this.bootstrapUrl.replace(/\/bootstrap$/, "/status");
      const payload = await this.requestJson<{ peers?: PeerStatus[] }>(statusUrl);
      this.communityPeers = (payload.peers ?? []).map((peer) => ({ ...peer, lifecycleState: peer.lifecycleState ?? "connected", source: peer.source ?? "hyperswarm" }));
      this.notifyStatusChange();
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
    const now = this.now();
    const offlineExpiry = now - this.offlineRetentionMs;
    for (const [id, peer] of this.peers) {
      const lastSeen = Date.parse(peer.lastSeenAt);
      const lifecycleState = derivePeerLifecycleState(peer, now, this.staleAfterMs, this.offlineRetentionMs);
      if (lifecycleState !== peer.lifecycleState) this.peers.set(id, { ...peer, lifecycleState });
      if (peer.source === "simulated" && lastSeen < offlineExpiry) this.peers.delete(id);
      if (peer.lifecycleState === "offline" && Date.parse(peer.lastSeenAt) < offlineExpiry) this.peers.delete(id);
    }
    return {
      state: this.error ? "error" : this.core ? "online" : "starting",
      peerId: this.core?.key?.toString("hex") ?? "",
      listening: this.listening,
      discovery: { connecting: this.swarm?.connecting ?? 0, connected: this.swarm?.connections?.size ?? 0 },
      peers: [...this.peers.values(), ...this.communityPeers.filter((peer) => !this.peers.has(peer.id))],
      replication: { coreKey: this.core?.key?.toString("hex") ?? "", length: this.core?.length ?? 0 },
      records: {
        coreKey: this.recordStore?.publicKey ?? "",
        length: this.recordStore?.length ?? 0,
        state: this.recordStore === null ? "unavailable" : (this.configuredRecordCoreKey ?? this.community?.recordCoreKey) ? "community" : "local",
      },
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
