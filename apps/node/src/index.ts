import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import { createNodeServer } from "./server.js";

const port = Number(process.env.PORT ?? 10000);
const dataDirectory = process.env.DATA_DIR ?? join(process.cwd(), "data");
const runtime = new PeerRuntime(dataDirectory, process.env.PEER_HOURS_BOOTSTRAP_KEY, undefined, Date.now, true, false);

await runtime.start();

const server = createNodeServer(runtime, {
  enableDevelopmentPeerRegistration: process.env.ENABLE_DEV_PEER_REGISTRATION === "true",
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Peer Hours node listening on port ${port}`);
  console.log(`Storage directory: ${dataDirectory}`);
  console.log(`Peer ID: ${runtime.status().peerId}`);
});

/** Gracefully closes the node HTTP server and embedded peer runtime. */
const shutdown = async () => {
  server.close();
  await runtime.stop();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
