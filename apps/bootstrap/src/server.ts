import { createServer, type Server } from "node:http";
import type { Duplex } from "node:stream";
import type { BootstrapManifest } from "./manifest.js";

const HTTP_REQUEST_TIMEOUT_MS = 15_000;
const HTTP_HEADERS_TIMEOUT_MS = 16_000;
const HTTP_KEEP_ALIVE_TIMEOUT_MS = 5_000;

/** Creates a read-only bootstrap HTTP service with no peer, identity, or record-management capabilities. */
export function createBootstrapServer(manifest: BootstrapManifest): Server {
  const server = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("content-security-policy", "default-src 'none'");
    const pathname = request.url === undefined ? null : safelyParsePathname(request.url);
    if (pathname === null) {
      request.resume();
      sendJson(response, 400, { error: "invalid request target" });
      return;
    }
    if (pathname === "/health" && request.method === "GET") {
      request.resume();
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (pathname === "/bootstrap" && request.method === "GET") {
      request.resume();
      response.setHeader("cache-control", "public, max-age=60");
      sendJson(response, 200, manifest);
      return;
    }
    request.resume();
    sendJson(response, 404, { error: "not found" });
  });
  configureHttpTimeouts(server);
  configureClientErrorResponse(server);
  return server;
}

/** Bounds idle and slow HTTP connections on the intentionally minimal public endpoint. */
function configureHttpTimeouts(server: Server): void {
  server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 1_000;
}

/** Returns a minimal fixed response when Node rejects malformed HTTP before a request handler exists. */
function configureClientErrorResponse(server: Server): void {
  server.on("clientError", (_error, socket) => sendBadRequest(socket));
}

/** Closes malformed client connections without reflecting parser errors or request bytes. */
function sendBadRequest(socket: Duplex): void {
  if (!socket.writable) return;
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
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
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
