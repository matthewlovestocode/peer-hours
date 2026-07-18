import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { JsonValue, PeerRuntime } from "@peer-hours/peer-runtime";
import { createRecordEnvelope, type RecordEnvelope, type RecordEnvelopeInput } from "@peer-hours/timebank-records";

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

/** Rejects non-object input before it enters the canonical record-envelope normalizer. */
function asRecordEnvelopeInput(value: unknown): RecordEnvelopeInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A community record must be a JSON object.");
  }
  return value as RecordEnvelopeInput;
}

/**
 * Validates and appends one local community record through the node's single-writer authority.
 *
 * This is deliberately an in-process boundary, not an HTTP endpoint: the current protocol has
 * no member submission authentication or signature-verification flow for arbitrary network writes.
 */
export async function appendValidatedCommunityRecord(
  runtime: PeerRuntime,
  communityId: string,
  input: unknown,
): Promise<{ index: number; record: RecordEnvelope }> {
  const record = createRecordEnvelope(asRecordEnvelopeInput(input));
  if (record.communityId !== communityId) {
    throw new TypeError("A community record must belong to this node's configured community.");
  }
  // createRecordEnvelope has already recursively normalized this plain JSON envelope.
  const index = await runtime.appendRecord(record as unknown as JsonValue);
  return { index, record };
}

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
export function createNodeServer(
  runtime: PeerRuntime,
  metadata: { communityId: string; displayName: string },
  options: NodeServerOptions = {},
): Server {
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
