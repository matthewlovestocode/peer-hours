import { PeerRuntime } from "@peer-hours/peer-runtime";
import { resolveNodeConfiguration } from "./config.js";
import { createNodeServer } from "./server.js";
import { loadOrCreateReceiptIdentity } from "./receipt-identity.js";
import { ReplicationReceiptIssuer } from "./receipt-issuer.js";

const configuration = resolveNodeConfiguration();
const runtime = new PeerRuntime(configuration.dataDirectory, configuration.bootstrapKey, undefined, Date.now, true, false);

await runtime.start();
const receiptIdentity = await loadOrCreateReceiptIdentity(configuration.receiptIdentityPath);

const server = createNodeServer(runtime, {
  enableDevelopmentPeerRegistration: configuration.enableDevelopmentPeerRegistration,
  receiptIssuer: new ReplicationReceiptIssuer(runtime, receiptIdentity),
});

server.listen(configuration.port, "0.0.0.0", () => {
  console.log(`Peer Hours node listening on port ${configuration.port}`);
  console.log(`Storage directory: ${configuration.dataDirectory}`);
  console.log(`Peer ID: ${runtime.status().peerId}`);
  console.log(`Receipt node ID: ${receiptIdentity.nodeId}`);
});

/** Gracefully closes the node HTTP server and embedded peer runtime. */
let shutdownPromise: Promise<void> | undefined;

/** Stops HTTP intake before closing durable peer storage; repeated signals share one shutdown operation. */
const shutdown = (): Promise<void> => {
  shutdownPromise ??= new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") return;
    throw error;
  }).then(() => runtime.stop());
  return shutdownPromise;
};

process.once("SIGINT", () => void shutdown().catch((error: unknown) => { console.error("Peer Hours node shutdown failed:", error); process.exitCode = 1; }));
process.once("SIGTERM", () => void shutdown().catch((error: unknown) => { console.error("Peer Hours node shutdown failed:", error); process.exitCode = 1; }));
