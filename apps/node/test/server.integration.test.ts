import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import { createNodeServer } from "../src/server.js";

/** Starts an ephemeral community API and returns its local URL and cleanup function. */
async function startTestNode(runtime: PeerRuntime): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createNodeServer(runtime, { communityId: "peer-hours/earth/test", displayName: "Test Community" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test node did not bind to a TCP port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

test("community node exposes simulator registration in its live roster", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-integration-"));
  const runtime = new PeerRuntime(directory);
  const node = await startTestNode(runtime);

  try {
    const register = await fetch(`${node.baseUrl}/dev/peers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "simulated-peer-a", action: "register" }) });
    assert.equal(register.status, 200);

    const status = await fetch(`${node.baseUrl}/status`).then((response) => response.json()) as { peers: Array<{ id: string; lifecycleState: string; source?: string }> };
    assert.deepEqual(status.peers, [{ id: "simulated-peer-a", connectedAt: status.peers[0].connectedAt, lastSeenAt: status.peers[0].lastSeenAt, lifecycleState: "connected", source: "simulated" }]);

    const unregister = await fetch(`${node.baseUrl}/dev/peers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "simulated-peer-a", action: "unregister" }) });
    assert.equal(unregister.status, 200);
    const emptyStatus = await fetch(`${node.baseUrl}/status`).then((response) => response.json()) as { peers: unknown[] };
    assert.deepEqual(emptyStatus.peers, []);
  } finally {
    await node.close();
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("community node restores a stale simulator peer when its heartbeat resumes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-heartbeat-"));
  let clock = Date.parse("2026-07-18T00:00:00.000Z");
  const runtime = new PeerRuntime(directory, undefined, undefined, () => clock);
  const node = await startTestNode(runtime);

  try {
    await fetch(`${node.baseUrl}/dev/peers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "simulated-peer-a", action: "register" }) });
    const initial = await fetch(`${node.baseUrl}/status`).then((response) => response.json()) as { peers: Array<{ connectedAt: string; lifecycleState: string }> };

    clock += 10_001;
    const stale = await fetch(`${node.baseUrl}/status`).then((response) => response.json()) as { peers: Array<{ lifecycleState: string }> };
    assert.equal(stale.peers[0].lifecycleState, "stale");

    clock += 1;
    await fetch(`${node.baseUrl}/dev/peers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "simulated-peer-a", action: "register" }) });
    const resumed = await fetch(`${node.baseUrl}/status`).then((response) => response.json()) as { peers: Array<{ connectedAt: string; lifecycleState: string }> };
    assert.equal(resumed.peers[0].lifecycleState, "connected");
    assert.equal(resumed.peers[0].connectedAt, initial.peers[0].connectedAt);
  } finally {
    await node.close();
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
