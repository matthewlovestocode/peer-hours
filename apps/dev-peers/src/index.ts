import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";

const peerCount = Number(process.env.PEER_COUNT ?? 3);
const dataRoot = process.env.DATA_DIR ?? join(process.cwd(), "data");
const bootstrapUrl = process.env.BOOTSTRAP_URL ?? "http://127.0.0.1:10000/bootstrap";
const peers = Array.from({ length: peerCount }, (_, index) => new PeerRuntime(join(dataRoot, `peer-${index + 1}`), undefined, bootstrapUrl));
const peerIds: string[] = [];
let heartbeatTimer: NodeJS.Timeout | null = null;

/** Registers a simulated peer with the local community-node development endpoint. */
const register = async (id: string) => {
  const url = bootstrapUrl.replace(/\/bootstrap$/, "/dev/peers");
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "register" }) });
};

/** Removes a simulated peer from the local community-node development endpoint. */
const unregister = async (id: string) => {
  const url = bootstrapUrl.replace(/\/bootstrap$/, "/dev/peers");
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "unregister" }) });
};

/** Starts the configured number of independent development peers. */
const start = async () => {
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
