import { createServer } from "node:http";
import { join } from "node:path";
import { PeerRuntime } from "@peer-hours/peer-runtime";

const port = Number(process.env.PORT ?? 10000);
const dataDirectory = process.env.DATA_DIR ?? join(process.cwd(), "data");
const runtime = new PeerRuntime(dataDirectory, process.env.PEER_HOURS_BOOTSTRAP_KEY);
const communityId = process.env.COMMUNITY_ID ?? "peer-hours/world/US/CA/east-bay";
const displayName = process.env.COMMUNITY_NAME ?? "East Bay Timebank";

await runtime.start();

const server = createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  const status = runtime.status();

  if (request.url === "/health" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: status.state === "online" ? "ok" : status.state, core: status.replication.coreKey, length: status.replication.length }));
    return;
  }

  if (request.url === "/status" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(status));
    return;
  }

  if (request.url === "/bootstrap" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ communityId, displayName, protocolVersion: 1, coreKey: status.replication.coreKey, bootstrapNodes: [] }));
    return;
  }

  if (request.url === "/dev/peers" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const payload = JSON.parse(body) as { id?: string; action?: "register" | "unregister" };
        if (!payload.id || !payload.action) throw new Error("id and action are required");
        if (payload.action === "register") runtime.registerSimulatedPeer(payload.id);
        else runtime.unregisterSimulatedPeer(payload.id);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "invalid request" }));
      }
    });
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
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
