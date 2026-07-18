import { createBootstrapManifest } from "./manifest.js";
import { createBootstrapServer } from "./server.js";

const port = Number(process.env.PORT ?? 10001);
const manifest = createBootstrapManifest({
  communityId: process.env.COMMUNITY_ID ?? "peer-hours/earth/US/CA/east-bay/oakland",
  displayName: process.env.COMMUNITY_NAME ?? "Oakland Timebank",
  coreKey: process.env.DISCOVERY_CORE_KEY ?? "",
  bootstrapNodes: (process.env.BOOTSTRAP_NODES ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  ...(process.env.COMMUNITY_NODE_URL === undefined ? {} : { communityNodeUrl: process.env.COMMUNITY_NODE_URL }),
});
const server = createBootstrapServer(manifest);

server.listen(port, "0.0.0.0", () => {
  console.log(`Peer Hours bootstrap service listening on port ${port}`);
  console.log(`Discovery scope: ${manifest.communityId}`);
});

/** Gracefully stops the read-only bootstrap HTTP service. */
const shutdown = () => server.close();

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
