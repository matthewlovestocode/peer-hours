import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import test from "node:test";
import { createBootstrapManifest } from "../src/manifest.js";
import { createBootstrapServer } from "../src/server.js";

const coreKey = "a".repeat(64);

/** Starts a read-only bootstrap service on an ephemeral local test port. */
async function startBootstrap() {
  const manifest = createBootstrapManifest({
    communityId: "peer-hours/earth/test",
    displayName: "Test Community",
    coreKey,
    bootstrapNodes: ["https://bootstrap.example.test/bootstrap"],
    communityNodeUrl: "https://peer.example.test",
  });
  const server = createBootstrapServer(manifest);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Bootstrap test server did not bind to a TCP port");
  return {
    manifest,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

/** Sends deliberately malformed HTTP and returns the fixed parser-level response. */
async function sendMalformedRequest(baseUrl: string): Promise<string> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port) });
    let response = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write("NOT HTTP\r\n\r\n"));
    socket.on("data", (chunk) => { response += chunk; });
    socket.once("end", () => resolve(response));
    socket.once("error", reject);
  });
}

test("serves only minimal, configured discovery metadata", async () => {
  const bootstrap = await startBootstrap();
  try {
    const response = await fetch(`${bootstrap.baseUrl}/bootstrap`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), bootstrap.manifest);
    assert.deepEqual(await fetch(`${bootstrap.baseUrl}/health`).then((result) => result.json()), { status: "ok" });
    assert.equal((await fetch(`${bootstrap.baseUrl}/status`)).status, 404);
    assert.equal((await fetch(`${bootstrap.baseUrl}/records`)).status, 404);
    assert.equal((await fetch(`${bootstrap.baseUrl}/bootstrap`, { method: "POST" })).status, 404);
    const queried = await fetch(`${bootstrap.baseUrl}/bootstrap?cache-bust=1`);
    assert.equal(queried.status, 200);
    assert.equal(queried.headers.get("x-content-type-options"), "nosniff");
    assert.equal(queried.headers.get("referrer-policy"), "no-referrer");
    assert.equal(queried.headers.get("x-frame-options"), "DENY");
    assert.equal(queried.headers.get("content-security-policy"), "default-src 'none'");
    assert.match(queried.headers.get("content-type") ?? "", /^application\/json; charset=utf-8/);
  } finally {
    await bootstrap.close();
  }
});

test("rejects incomplete or unsafe manifest configuration", () => {
  assert.throws(() => createBootstrapManifest({ communityId: "", displayName: "Test", coreKey }));
  assert.throws(() => createBootstrapManifest({ communityId: "peer-hours/earth/test", displayName: "Test", coreKey: "not-a-core-key" }));
  assert.throws(() => createBootstrapManifest({ communityId: "peer-hours/earth/test", displayName: "Test", coreKey, bootstrapNodes: ["ftp://example.test"] }));
  assert.throws(() => createBootstrapManifest({ communityId: "peer-hours/earth/test", displayName: "Test", coreKey, bootstrapNodes: ["https://operator:secret@bootstrap.example.test"] }));
  assert.throws(() => createBootstrapManifest({ communityId: "peer-hours/earth/test", displayName: "Test", coreKey, bootstrapNodes: ["https://bootstrap.example.test", "https://bootstrap.example.test/"] }), /duplicate/);
  assert.throws(() => createBootstrapManifest({ communityId: "peer-hours/earth/test", displayName: "Test", coreKey, bootstrapNodes: Array.from({ length: 17 }, () => "https://bootstrap.example.test") }), /At most 16/);
});

test("closes malformed HTTP with a fixed parser-level response", async () => {
  const bootstrap = await startBootstrap();
  try {
    const response = await sendMalformedRequest(bootstrap.baseUrl);
    assert.match(response, /^HTTP\/1\.1 400 Bad Request\r\n/);
    assert.match(response, /Connection: close\r\n/);
    assert.match(response, /Content-Length: 0\r\n/);
    assert.doesNotMatch(response, /Parse Error|NOT HTTP/);
  } finally {
    await bootstrap.close();
  }
});
