import { createServer, type Server, type ServerResponse } from "node:http";
import type { PeerRuntime } from "@peer-hours/peer-runtime";

/** Writes a cache-safe snapshot of record-core metadata and immutable records without exposing mutations. */
async function respondWithRecords(response: ServerResponse, runtime: PeerRuntime): Promise<void> {
  try {
    const status = runtime.status();
    const records = await runtime.readRecords();
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ recordCore: status.records, records }));
  } catch (error) {
    response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Record core is unavailable" }));
  }
}

/** Creates the community node HTTP API used by desktop peers and development simulators. */
export function createNodeServer(runtime: PeerRuntime, metadata: { communityId: string; displayName: string }): Server {
  return createServer((request, response) => {
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
      response.end(JSON.stringify({ communityId: metadata.communityId, displayName: metadata.displayName, protocolVersion: 1, coreKey: status.replication.coreKey, recordCoreKey: status.records.coreKey, bootstrapNodes: [] }));
      return;
    }

    if (request.url === "/records" && request.method === "GET") {
      void respondWithRecords(response, runtime);
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
}
