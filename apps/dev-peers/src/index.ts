import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";

const peerCount = Number(process.env.PEER_COUNT ?? 3);
const dataRoot = process.env.DATA_DIR ?? join(process.cwd(), "data");
const bootstrapUrls = configuredBootstrapUrls();
const communityNodeUrl = process.env.COMMUNITY_NODE_URL ?? "http://127.0.0.1:10000";
const peers = Array.from({ length: peerCount }, (_, index) => new PeerRuntime(join(dataRoot, `peer-${index + 1}`), undefined, bootstrapUrls));
const peerIds: string[] = [];
let heartbeatTimer: NodeJS.Timeout | null = null;

/** Reads an explicit comma-separated failover list, retaining the historical single-endpoint development default. */
function configuredBootstrapUrls(): readonly string[] {
  const configured = process.env.BOOTSTRAP_URLS;
  if (configured === undefined) return [process.env.BOOTSTRAP_URL ?? "http://127.0.0.1:10001/bootstrap"];
  const urls = configured.split(",").map((url) => url.trim());
  if (urls.length === 0 || urls.some((url) => url.length === 0)) {
    throw new Error("BOOTSTRAP_URLS must be a comma-separated list of nonblank bootstrap URLs.");
  }
  return urls;
}

/** Ensures simulated roster registration is explicitly enabled for this development-only process. */
function requireDevelopmentPeerRegistration(): void {
  if (process.env.ENABLE_DEV_PEER_REGISTRATION !== "true") {
    throw new Error("Development peer registration is disabled. Set ENABLE_DEV_PEER_REGISTRATION=true for both the community node and this simulator.");
  }
}

/** Raises a useful error when the community node rejects simulated-peer registration. */
async function ensureRegistrationSucceeded(response: Response): Promise<void> {
  if (response.ok) return;
  const detail = await response.text();
  throw new Error(`Development peer registration failed (${response.status}): ${detail}`);
}

/** Registers a simulated peer with the local community-node development endpoint. */
const register = async (id: string) => {
  const url = `${communityNodeUrl}/dev/peers`;
  await ensureRegistrationSucceeded(await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "register" }) }));
};

/** Removes a simulated peer from the local community-node development endpoint. */
const unregister = async (id: string) => {
  const url = `${communityNodeUrl}/dev/peers`;
  await ensureRegistrationSucceeded(await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "unregister" }) }));
};

/** Starts the configured number of independent development peers. */
const start = async () => {
  requireDevelopmentPeerRegistration();
  await Promise.all(peers.map((peer) => peer.start()));
  peerIds.push(...peers.map((peer) => peer.status().peerId));
  await Promise.all(peers.map((_, index) => register(peerIds[index])));
  heartbeatTimer = setInterval(() => void Promise.all(peerIds.map(register)), 3_000);
  console.log(`Started ${peers.length} simulated peers`);
  peers.forEach((peer, index) => console.log(`Peer ${index + 1}: ${peer.status().peerId}`));
};

/** Stops all simulated peers and releases their local resources. */
const stop = async () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await Promise.all(peerIds.map((id) => unregister(id).catch(() => undefined)));
  await Promise.all(peers.map((peer) => peer.stop()));
};

await start();
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
