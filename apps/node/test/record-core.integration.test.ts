import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import { createNodeServer } from "../src/server.js";

type RecordCoreStatus = { coreKey: string; length: number; state: "local" | "community" | "unavailable" };
type RecordCoreResponse = { recordCore: RecordCoreStatus; records: unknown[] };
type BootstrapResponse = { recordCoreKey: string };

/** Starts a local node API around an already-running ephemeral peer runtime. */
async function startRecordCoreTestNode(runtime: PeerRuntime): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createNodeServer(runtime, { communityId: "peer-hours/earth/test", displayName: "Test Community" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test node did not bind to a TCP port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("community node exposes its read-only record core through bootstrap and records APIs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-record-core-"));
  const runtime = new PeerRuntime(directory, undefined, undefined, Date.now, undefined, false);
  await runtime.start();
  await runtime.appendRecord({ id: "record-a", kind: "test-record", value: "immutable" });
  const node = await startRecordCoreTestNode(runtime);

  try {
    const bootstrap = await fetch(`${node.baseUrl}/bootstrap`).then((response) => response.json()) as BootstrapResponse;
    const response = await fetch(`${node.baseUrl}/records`);
    const body = await response.json() as RecordCoreResponse;

    assert.equal(response.status, 200);
    assert.equal(body.recordCore.state, "local");
    assert.equal(body.recordCore.length, 1);
    assert.match(body.recordCore.coreKey, /^[a-f0-9]{64}$/);
    assert.equal(bootstrap.recordCoreKey, body.recordCore.coreKey);
    assert.deepEqual(body.records, [{ id: "record-a", kind: "test-record", value: "immutable" }]);
  } finally {
    await node.close();
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
