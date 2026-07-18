import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { PeerRuntime } from "@peer-hours/peer-runtime";
import { createHealthPayload } from "./health.js";

const DEVELOPMENT_PEER_BODY_LIMIT_BYTES = 4 * 1024;

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
  return createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    const pathname = request.url === undefined ? null : safelyParsePathname(request.url);
    if (pathname === null) {
      sendJson(response, 400, { error: "invalid request target" });
      return;
    }
    const status = runtime.status();

    if (pathname === "/health" && request.method === "GET") {
      const health = createHealthPayload({
        state: status.state === "online" ? "ok" : status.state,
        core: status.replication.coreKey,
        length: status.replication.length,
      });
      sendJson(response, health.status === "ok" ? 200 : 503, health);
      return;
    }

    if (pathname === "/status" && request.method === "GET") {
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

    sendJson(response, 404, { error: "not found" });
  });
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
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
