import { PeerRuntime } from "@peer-hours/peer-runtime";
import { resolveNodeConfiguration } from "./config.js";
import { createNodeServer } from "./server.js";

const configuration = resolveNodeConfiguration();
const runtime = new PeerRuntime(configuration.dataDirectory, process.env.PEER_HOURS_BOOTSTRAP_KEY, undefined, Date.now, true, false);

await runtime.start();

const server = createNodeServer(runtime, {
  enableDevelopmentPeerRegistration: process.env.ENABLE_DEV_PEER_REGISTRATION === "true",
});

server.listen(configuration.port, "0.0.0.0", () => {
  console.log(`Peer Hours node listening on port ${configuration.port}`);
  console.log(`Storage directory: ${configuration.dataDirectory}`);
  console.log(`Peer ID: ${runtime.status().peerId}`);
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
