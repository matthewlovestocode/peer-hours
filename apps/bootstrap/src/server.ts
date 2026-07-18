import { createServer, type Server } from "node:http";
import type { BootstrapManifest } from "./manifest.js";

/** Creates a read-only bootstrap HTTP service with no peer, identity, or record-management capabilities. */
export function createBootstrapServer(manifest: BootstrapManifest): Server {
  return createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    if (request.url === "/health" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/bootstrap" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" });
      response.end(JSON.stringify(manifest));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });
}
