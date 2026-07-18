import { createServer, type IncomingMessage, type Server } from "node:http";
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
    const status = runtime.status();

    if (request.url === "/health" && request.method === "GET") {
      const health = createHealthPayload({
        state: status.state === "online" ? "ok" : status.state,
        core: status.replication.coreKey,
        length: status.replication.length,
      });
      response.writeHead(health.status === "ok" ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.url === "/status" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(status));
      return;
    }

    if (request.url === "/dev/peers" && request.method === "POST" && options.enableDevelopmentPeerRegistration) {
      void readDevelopmentPeerPayload(request)
        .then((payload) => {
          if (payload.action === "register") runtime.registerSimulatedPeer(payload.id);
          else runtime.unregisterSimulatedPeer(payload.id);
          response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          response.end(JSON.stringify({ ok: true }));
        })
        .catch((error: unknown) => {
          const statusCode = error instanceof RangeError ? 413 : 400;
          response.writeHead(statusCode, { "content-type": "application/json", "cache-control": "no-store" });
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : "invalid request" }));
        });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });
}
