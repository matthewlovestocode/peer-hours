import { createServer, type Server } from "node:http";
import type { BootstrapManifest } from "./manifest.js";

/** Creates a read-only bootstrap HTTP service with no peer, identity, or record-management capabilities. */
export function createBootstrapServer(manifest: BootstrapManifest): Server {
  return createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    const pathname = request.url === undefined ? null : safelyParsePathname(request.url);
    if (pathname === null) {
      sendJson(response, 400, { error: "invalid request target" });
      return;
    }
    if (pathname === "/health" && request.method === "GET") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (pathname === "/bootstrap" && request.method === "GET") {
      response.setHeader("cache-control", "public, max-age=60");
      sendJson(response, 200, manifest);
      return;
    }
    sendJson(response, 404, { error: "not found" });
  });
}

/** Parses only the pathname so query parameters cannot change the read-only route surface. */
function safelyParsePathname(requestTarget: string): string | null {
  try {
    return new URL(requestTarget, "http://bootstrap.invalid").pathname;
  } catch {
    return null;
  }
}

/** Emits a consistently typed JSON response without reflecting untrusted request content. */
function sendJson(response: import("node:http").ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
