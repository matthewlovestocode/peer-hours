import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { PeerRuntime } from "@peer-hours/peer-runtime";
import { createHealthPayload } from "./health.js";

const DEVELOPMENT_PEER_BODY_LIMIT_BYTES = 4 * 1024;
const HTTP_REQUEST_TIMEOUT_MS = 15_000;
const HTTP_HEADERS_TIMEOUT_MS = 16_000;
const HTTP_KEEP_ALIVE_TIMEOUT_MS = 5_000;

/** Limits the optional development-only simulator registration route. */
export interface NodeServerOptions {
  enableDevelopmentPeerRegistration?: boolean;
}

/** Parses a bounded JSON request body without allowing development tooling to exhaust node memory. */
async function readDevelopmentPeerPayload(request: IncomingMessage): Promise<{ id: string; action: "register" | "unregister" }> {
  const contentType = request.headers["content-type"];
  if (!contentType?.toLowerCase().startsWith("application/json")) {
    throw new TypeError("content-type must be application/json");
  }

  const contentLength = request.headers["content-length"];
  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new TypeError("content-length must be a positive integer");
  }
  if (contentLength && Number(contentLength) > DEVELOPMENT_PEER_BODY_LIMIT_BYTES) {
    throw new RangeError("request body is too large");
  }

  let body = "";
  let bodySize = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    bodySize += Buffer.byteLength(text);
    if (bodySize > DEVELOPMENT_PEER_BODY_LIMIT_BYTES) tooLarge = true;
    else body += text;
  }
  if (tooLarge) throw new RangeError("request body is too large");

  const payload: unknown = JSON.parse(body);
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("request body must be a JSON object");
  }
  const { id, action } = payload as { id?: unknown; action?: unknown };
  if (typeof id !== "string" || id.length === 0 || id.length > 256) {
    throw new TypeError("id must be a non-empty string no longer than 256 characters");
  }
  if (action !== "register" && action !== "unregister") {
    throw new TypeError("action must be register or unregister");
  }
  return { id, action };
}

/** Creates the community-peer diagnostics API used by operators and development simulators. */
export function createNodeServer(
  runtime: PeerRuntime,
  options: NodeServerOptions = {},
): Server {
  const server = createServer((request, response) => {
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
    const status = runtime.status();

    if (pathname === "/health" && request.method === "GET") {
      request.resume();
      const health = createHealthPayload({
        state: status.state === "online" ? "ok" : status.state,
        core: status.replication.coreKey,
        length: status.replication.length,
      });
      sendJson(response, health.status === "ok" ? 200 : 503, health);
      return;
    }

    if (pathname === "/status" && request.method === "GET") {
      request.resume();
      sendJson(response, 200, status);
      return;
    }

    if (pathname === "/dev/peers" && request.method === "POST" && options.enableDevelopmentPeerRegistration) {
      void readDevelopmentPeerPayload(request)
        .then((payload) => {
          if (payload.action === "register") runtime.registerSimulatedPeer(payload.id);
          else runtime.unregisterSimulatedPeer(payload.id);
          sendJson(response, 200, { ok: true });
        })
        .catch((error: unknown) => {
          const statusCode = error instanceof RangeError ? 413 : 400;
          sendJson(response, statusCode, { error: error instanceof Error ? error.message : "invalid request" });
        });
      return;
    }

    request.resume();
    sendJson(response, 404, { error: "not found" });
  });
  configureHttpTimeouts(server);
  configureClientErrorResponse(server);
  return server;
}

/** Bounds idle and slow HTTP connections so diagnostics cannot monopolize a community node. */
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

/** Parses only the pathname so query parameters cannot alter the operational HTTP surface. */
function safelyParsePathname(requestTarget: string): string | null {
  try {
    return new URL(requestTarget, "http://community-node.invalid").pathname;
  } catch {
    return null;
  }
}

/** Emits a consistently typed JSON response without reflecting untrusted request content. */
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
