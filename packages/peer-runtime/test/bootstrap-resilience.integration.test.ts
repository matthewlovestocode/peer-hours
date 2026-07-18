import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type RequestListener, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PeerRuntime } from "../src/index.js";

const coreKey = "a".repeat(64);

/** Starts a minimal bootstrap fixture and returns its endpoint plus deterministic shutdown. */
async function startBootstrapFixture(handler: RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Bootstrap fixture did not bind to a TCP port");
  return {
    url: `http://127.0.0.1:${address.port}/bootstrap`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

/** Writes one complete bootstrap manifest response with an optional advertised fallback endpoint. */
function sendManifest(response: ServerResponse, bootstrapNodes: readonly string[]): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    communityId: "peer-hours/test/resilient-bootstrap",
    displayName: "Resilient Bootstrap Test",
    protocolVersion: 1,
    role: "bootstrap",
    capabilities: ["discovery-metadata"],
    coreKey,
    bootstrapNodes,
    communityNodeUrl: null,
  }));
}

test("uses a redundant bootstrap endpoint when the first configured endpoint is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-bootstrap-failover-"));
  const unavailable = await startBootstrapFixture((_request, response) => {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "temporarily unavailable" }));
  });
  const recoveryEndpoint = "https://backup.example.test/bootstrap";
  const available = await startBootstrapFixture((_request, response) => sendManifest(response, [recoveryEndpoint]));
  const runtime = new PeerRuntime(directory, undefined, [unavailable.url, available.url], Date.now, false);

  try {
    await runtime.start();
    const status = runtime.status();
    assert.equal(status.bootstrap.state, "fetched");
    assert.equal(status.bootstrap.url, available.url);
    assert.deepEqual(status.bootstrap.urls, [unavailable.url, available.url, recoveryEndpoint]);
    assert.equal(status.bootstrap.consecutiveFailures, 0);
    assert.equal(status.bootstrap.lastError, null);
    assert.ok(status.bootstrap.lastFetchedAt);
    assert.equal(status.community?.coreKey, coreKey);
  } finally {
    await runtime.stop();
    await unavailable.close();
    await available.close();
    await rm(directory, { recursive: true, force: true });
  }
});
