import { mkdir } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { createMemberFeedAnnouncement, type MemberFeedAnnouncement } from "@peer-hours/timebank-identity";
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
  startedAt: string;
  uptimeMs: number;
  listening: boolean;
  discovery: { connecting: number; connected: number };
  peers: PeerStatus[];
  replication: { coreKey: string; length: number };
  memberFeed: { coreKey: string; length: number; state: "ready" | "unavailable" };
  discoveredMemberFeeds: readonly DiscoveredMemberFeed[];
  error: string | null;
  bootstrap: { url: string | null; state: "not-configured" | "fetching" | "fetched" | "error" };
  community: CommunityManifest | null;
};

export type CommunityManifest = {
  communityId: string;
  displayName: string;
  protocolVersion: number;
  role: "bootstrap";
  capabilities: readonly BootstrapCapability[];
  coreKey: string;
  bootstrapNodes: string[];
  communityNodeUrl: string | null;
};

/** Capabilities the optional bootstrap service may advertise without gaining authority over the network. */
export type BootstrapCapability = "discovery-metadata";

/** A validated, short-lived member feed announcement currently known to this local runtime. */
export type DiscoveredMemberFeed = {
  communityId: string;
  memberId: string;
  feedPublicKey: string;
  expiresAt: string;
};

type JsonRecord = Record<string, unknown>;

/** Parses untrusted bootstrap JSON into the complete community metadata the runtime can safely use. */
export function parseCommunityManifest(payload: unknown): CommunityManifest {
  if (!isJsonRecord(payload)) throw new Error("Bootstrap metadata must be a JSON object.");

  const communityId = requiredNonblankString(payload, "communityId");
  const displayName = requiredNonblankString(payload, "displayName");
  const protocolVersion = positiveProtocolVersion(payload.protocolVersion);
  const role = bootstrapRole(payload.role);
  const capabilities = bootstrapCapabilities(payload.capabilities);
  const coreKey = validCoreKey(requiredNonblankString(payload, "coreKey"), "coreKey");
  const bootstrapNodes = validBootstrapNodes(payload.bootstrapNodes);
  const communityNodeUrl = optionalCommunityNodeUrl(payload.communityNodeUrl);

  return { communityId, displayName, protocolVersion, role, capabilities, coreKey, bootstrapNodes, communityNodeUrl };
}

/** Narrows an untrusted JSON value to a plain object-like record. */
function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a required string field and rejects blank identifiers or labels. */
function requiredNonblankString(payload: JsonRecord, field: string): string {
  const value = payload[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Bootstrap metadata field ${field} must be a nonblank string.`);
  }
  return value;
}

/** Validates the positive integer protocol version understood by this runtime. */
function positiveProtocolVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Bootstrap metadata field protocolVersion must be a positive integer.");
  }
  return value;
}

/** Validates the fixed-length hexadecimal public key used to open a Hypercore. */
function validCoreKey(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`Bootstrap metadata field ${field} must be a 64-character hexadecimal Hypercore key.`);
  }
  return value.toLowerCase();
}

/** Accepts only the narrow role that serves entry metadata rather than operating a community peer. */
function bootstrapRole(value: unknown): "bootstrap" {
  if (value !== "bootstrap") throw new Error("Bootstrap metadata field role must be bootstrap.");
  return value;
}

/** Validates the bootstrap service's only descriptive capability. */
function bootstrapCapabilities(value: unknown): readonly BootstrapCapability[] {
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== "discovery-metadata") {
    throw new Error("Bootstrap metadata field capabilities must be [discovery-metadata].");
  }
  return Object.freeze(["discovery-metadata"]);
}

/** Validates bootstrap node locations without accepting non-web URL schemes. */
function validBootstrapNodes(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Bootstrap metadata field bootstrapNodes must be an array of HTTP(S) URLs.");
  return value.map((node, index) => {
    if (typeof node !== "string") {
      throw new Error(`Bootstrap metadata bootstrapNodes[${index}] must be an HTTP(S) URL string.`);
    }
    try {
      const url = new URL(node);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
      return url.toString();
    } catch {
      throw new Error(`Bootstrap metadata bootstrapNodes[${index}] must be a valid HTTP(S) URL.`);
    }
  });
}

/** Parses an optional diagnostics endpoint for an independently deployed community peer. */
function optionalCommunityNodeUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("Bootstrap metadata field communityNodeUrl must be an HTTP(S) URL string when provided.");
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    return url.toString();
  } catch {
    throw new Error("Bootstrap metadata field communityNodeUrl must be a valid HTTP(S) URL when provided.");
  }
}

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
  private readonly startedAtMs: number;
  private readonly startedAt: string;
  private readonly networkingEnabled: boolean;
  private readonly memberFeedEnabled: boolean;
  private store: any;
  private core: any;
  private memberRecordStore: HypercoreRecordStore | null = null;
  private bootstrapCore: any;
  private memberFeedAnnouncementExtension: { broadcast(message: unknown): void; destroy(): void } | null = null;
  private readonly discoveredMemberFeedAnnouncements = new Map<string, MemberFeedAnnouncement>();
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

  /** Creates a peer runtime using an app-owned data directory, optional bootstrap core, and optional local member feed. */
  constructor(
    dataDirectory: string,
    bootstrapKey?: string,
    bootstrapUrl?: string,
    now: () => number = Date.now,
    networkingEnabled = true,
    memberFeedEnabled = true,
  ) {
    this.dataDirectory = dataDirectory;
    this.bootstrapKey = bootstrapKey ? Buffer.from(bootstrapKey, "hex") : null;
    this.bootstrapUrl = bootstrapUrl ?? null;
    this.now = now;
    this.startedAtMs = this.now();
    this.startedAt = new Date(this.startedAtMs).toISOString();
    this.networkingEnabled = networkingEnabled;
    this.memberFeedEnabled = memberFeedEnabled;
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
      if (!this.memberFeedEnabled) this.registerMemberFeedAnnouncementExtension(this.core);
      if (this.memberFeedEnabled) {
        this.memberRecordStore = await HypercoreRecordStore.open(this.store, "peer-hours-member-records");
      }
      if (this.networkingEnabled) {
        this.startNetworking();
      }
      if (this.bootstrapKey) this.bootstrapState = "fetched";
      const bootstrapKey = this.bootstrapKey ?? await this.fetchBootstrapKey();
      if (bootstrapKey) {
        this.bootstrapCore = this.store.get({ key: bootstrapKey, valueEncoding: "json" });
        await this.bootstrapCore.ready();
        this.registerMemberFeedAnnouncementExtension();
        if (this.networkingEnabled) this.join(this.bootstrapCore.discoveryKey);
      }
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

  /** Returns this runtime's independently writable member-feed key for sharing through a future discovery protocol. */
  get memberRecordFeedKey(): string {
    return this.memberRecordStore?.publicKey ?? "";
  }

  /** Appends one immutable record to this runtime's member-owned feed, never to a community-owned core. */
  async appendMemberRecord(record: JsonValue): Promise<number> {
    if (this.memberRecordStore === null) throw new Error("The member record feed is not ready.");
    const index = await this.memberRecordStore.append(record);
    this.notifyStatusChange();
    return index;
  }

  /** Reads the complete local history from this runtime's independently owned member feed. */
  async readMemberRecords(): Promise<readonly JsonValue[]> {
    return this.memberRecordStore?.readAll() ?? Object.freeze([]);
  }

  /** Opens a known remote member feed as read-only data available through Corestore replication. */
  async readMemberRecordsFromFeed(feedPublicKey: string): Promise<readonly JsonValue[]> {
    if (this.store === undefined) throw new Error("The local Corestore is not ready.");
    const feed = await HypercoreRecordStore.open(this.store, "peer-hours-member-records", feedPublicKey);
    return feed.readAll();
  }

  /** Publishes this member runtime's signed, expiring feed announcement to peers on its discovery core. */
  publishMemberFeedAnnouncement(announcement: MemberFeedAnnouncement): void {
    const normalized = createMemberFeedAnnouncement(announcement);
    if (this.memberRecordStore === null) throw new Error("Only a member runtime with a local member feed can announce a feed.");
    if (normalized.declaration.feedPublicKey !== this.memberRecordStore.publicKey) {
      throw new Error("A member runtime can announce only its own local member feed.");
    }
    if (this.isExpiredMemberFeedAnnouncement(normalized)) {
      throw new Error("A member runtime cannot publish an expired member feed announcement.");
    }

    this.rememberMemberFeedAnnouncement(normalized);
    this.broadcastMemberFeedAnnouncements();
    this.notifyStatusChange();
  }

  /** Returns unexpired validated member-feed announcements currently cached by this runtime. */
  knownMemberFeeds(): readonly DiscoveredMemberFeed[] {
    this.pruneExpiredMemberFeedAnnouncements();
    return Object.freeze([...this.discoveredMemberFeedAnnouncements.values()]
      .map((announcement) => ({
        communityId: announcement.declaration.communityId,
        memberId: announcement.declaration.memberId,
        feedPublicKey: announcement.declaration.feedPublicKey,
        expiresAt: announcement.expiresAt,
      }))
      .sort((left, right) => left.communityId.localeCompare(right.communityId)
        || left.memberId.localeCompare(right.memberId)
        || left.feedPublicKey.localeCompare(right.feedPublicKey)));
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
      const payload = await this.requestJson<unknown>(this.bootstrapUrl);
      this.community = parseCommunityManifest(payload);
      this.bootstrapState = "fetched";
      console.log("bootstrap metadata received");
      return Buffer.from(this.community.coreKey, "hex");
    } catch (cause) {
      this.bootstrapState = "error";
      this.error = cause instanceof Error ? cause.message : "Unable to reach bootstrap node";
      console.error("bootstrap failed:", cause);
      return null;
    }
  }

  /** Registers the signed member-feed announcement extension on the shared discovery core. */
  private registerMemberFeedAnnouncementExtension(discoveryCore = this.bootstrapCore): void {
    if (discoveryCore === undefined || this.memberFeedAnnouncementExtension !== null) return;
    this.memberFeedAnnouncementExtension = discoveryCore.registerExtension("peer-hours/member-feed-announcement/v1", {
      encoding: "json",
      onmessage: (announcement: unknown) => { void this.receiveMemberFeedAnnouncement(announcement); },
    });
    discoveryCore.on("peer-add", () => this.broadcastMemberFeedAnnouncements());
    this.broadcastMemberFeedAnnouncements();
  }

  /** Validates, caches, relays, and opens a newly announced remote member feed for replication. */
  private async receiveMemberFeedAnnouncement(value: unknown): Promise<void> {
    let announcement: MemberFeedAnnouncement;
    try {
      announcement = createMemberFeedAnnouncement(value as MemberFeedAnnouncement);
    } catch {
      return;
    }
    if (this.isExpiredMemberFeedAnnouncement(announcement)) return;
    if (!this.rememberMemberFeedAnnouncement(announcement)) return;
    try {
      await this.readMemberRecordsFromFeed(announcement.declaration.feedPublicKey);
    } catch {
      return;
    }
    this.broadcastMemberFeedAnnouncements();
    this.notifyStatusChange();
  }

  /** Adds a new announcement only when it is not a duplicate of the locally cached signed terms. */
  private rememberMemberFeedAnnouncement(announcement: MemberFeedAnnouncement): boolean {
    const key = `${announcement.declaration.communityId}\u0000${announcement.declaration.memberId}\u0000${announcement.declaration.feedPublicKey}`;
    const existing = this.discoveredMemberFeedAnnouncements.get(key);
    if (existing !== undefined && JSON.stringify(existing) === JSON.stringify(announcement)) return false;
    this.discoveredMemberFeedAnnouncements.set(key, announcement);
    return true;
  }

  /** Broadcasts every current announcement so a connected community peer can relay cached feeds. */
  private broadcastMemberFeedAnnouncements(): void {
    this.pruneExpiredMemberFeedAnnouncements();
    if (this.memberFeedAnnouncementExtension === null) return;
    for (const announcement of this.discoveredMemberFeedAnnouncements.values()) {
      this.memberFeedAnnouncementExtension.broadcast(announcement);
    }
  }

  /** Removes expired announcements before they can be displayed, relayed, or used for replication. */
  private pruneExpiredMemberFeedAnnouncements(): void {
    for (const [key, announcement] of this.discoveredMemberFeedAnnouncements) {
      if (this.isExpiredMemberFeedAnnouncement(announcement)) this.discoveredMemberFeedAnnouncements.delete(key);
    }
  }

  /** Determines whether an announcement's signed discovery window has already ended. */
  private isExpiredMemberFeedAnnouncement(announcement: MemberFeedAnnouncement): boolean {
    return Date.parse(announcement.expiresAt) <= this.now();
  }

  /** Reads the community node's peer roster for development visibility and diagnostics. */
  private async refreshCommunityPeers(): Promise<void> {
    const communityNodeUrl = this.community?.communityNodeUrl;
    if (!communityNodeUrl) return;
    try {
      const payload = await this.requestJson<{ peers?: PeerStatus[] }>(`${communityNodeUrl}/status`);
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
      startedAt: this.startedAt,
      uptimeMs: Math.max(0, now - this.startedAtMs),
      listening: this.listening,
      discovery: { connecting: this.swarm?.connecting ?? 0, connected: this.swarm?.connections?.size ?? 0 },
      peers: [...this.peers.values(), ...this.communityPeers.filter((peer) => !this.peers.has(peer.id))],
      replication: { coreKey: this.core?.key?.toString("hex") ?? "", length: this.core?.length ?? 0 },
      memberFeed: {
        coreKey: this.memberRecordStore?.publicKey ?? "",
        length: this.memberRecordStore?.length ?? 0,
        state: this.memberRecordStore === null ? "unavailable" : "ready",
      },
      discoveredMemberFeeds: this.knownMemberFeeds(),
      error: this.error,
      bootstrap: { url: this.bootstrapUrl, state: this.bootstrapState },
      community: this.community,
    };
  }

  /** Stops discovery and closes local storage during application shutdown. */
  async stop(): Promise<void> {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.memberFeedAnnouncementExtension?.destroy();
    if (this.swarm) await this.swarm.destroy();
    if (this.store) await this.store.close();
  }
}
