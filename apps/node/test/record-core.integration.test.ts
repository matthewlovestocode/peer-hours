import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import { appendValidatedCommunityRecord, createNodeServer } from "../src/server.js";

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

test("community node appends only canonical records for its configured community without exposing an HTTP writer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-validated-record-core-"));
  const runtime = new PeerRuntime(directory, undefined, undefined, Date.now, undefined, false);
  await runtime.start();
  const node = await startRecordCoreTestNode(runtime);
  const record = {
    id: "record-a",
    schema: "peer-hours/test-record/v1",
    version: 1,
    kind: "test.recorded",
    communityId: "peer-hours/earth/test",
    occurredAt: "2026-07-18T12:00:00.000Z",
    authorId: "community-operator",
    payload: { title: "Canonical record" },
  };

  try {
    const appended = await appendValidatedCommunityRecord(runtime, "peer-hours/earth/test", record);
    assert.equal(appended.index, 0);
    assert.deepEqual(appended.record, record);
    assert.equal(Object.isFrozen(appended.record), true);

    await assert.rejects(
      () => appendValidatedCommunityRecord(runtime, "peer-hours/earth/test", { ...record, communityId: "peer-hours/earth/test/other" }),
      /configured community/,
    );
    await assert.rejects(
      () => appendValidatedCommunityRecord(runtime, "peer-hours/earth/test", { ...record, occurredAt: "not-a-timestamp" }),
      /canonical UTC ISO-8601/,
    );
    assert.equal((await runtime.readRecords()).length, 1);

    const writeAttempt = await fetch(`${node.baseUrl}/records`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
    assert.equal(writeAttempt.status, 404);
  } finally {
    await node.close();
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
