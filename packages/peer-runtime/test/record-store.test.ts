import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Corestore from "corestore";
import { HypercoreRecordStore } from "../src/record-store.js";

type TestRecord = {
  id: string;
  schema: string;
  version: number;
  kind: string;
  communityId: string;
  occurredAt: string;
  authorId: string;
  payload: { title: string; tags: string[] };
};

/** Creates a stable shared-envelope-shaped record without assigning timebank policy. */
function record(id: string, title: string): TestRecord {
  return {
    id,
    schema: "peer-hours/test-record",
    version: 1,
    kind: "example.recorded",
    communityId: "peer-hours/earth/test",
    occurredAt: "2026-07-18T12:00:00.000Z",
    authorId: "test-author",
    payload: { title, tags: ["example"] },
  };
}

/** Waits until a replicated core exposes an expected record count. */
async function waitForLength(store: HypercoreRecordStore, length: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (store.length !== length) {
    if (Date.now() >= deadline) throw new Error(`Replication timed out waiting for ${length} records`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("appends and reads frozen JSON records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-record-store-"));
  const corestore = new Corestore(directory);

  try {
    const store = await HypercoreRecordStore.open<TestRecord>(corestore, "generic-records");
    const source = record("record-a", "Original title");

    assert.equal(await store.append(source), 0);
    source.payload.title = "Changed after append";

    const saved = await store.read(0);
    assert.deepEqual(saved, record("record-a", "Original title"));
    assert.equal(Object.isFrozen(saved), true);
    assert.equal(Object.isFrozen(saved?.payload), true);
    assert.equal(await store.read(1), null);
  } finally {
    await corestore.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("serializes concurrent appends so every caller receives its distinct immutable sequence index", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-record-store-concurrent-"));
  const corestore = new Corestore(directory);

  try {
    const store = await HypercoreRecordStore.open<TestRecord>(corestore, "generic-records");
    const writes = await Promise.all(
      Array.from({ length: 24 }, (_, index) => store.append(record(`record-${index}`, `Concurrent record ${index}`))),
    );

    assert.deepEqual(writes, Array.from({ length: 24 }, (_, index) => index));
    assert.deepEqual(
      (await store.readAll()).map(({ id }) => id),
      Array.from({ length: 24 }, (_, index) => `record-${index}`),
    );
  } finally {
    await corestore.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects malformed public keys before attempting to open an untrusted remote record feed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-record-store-invalid-key-"));
  const corestore = new Corestore(directory);

  try {
    await assert.rejects(() => HypercoreRecordStore.open(corestore, "generic-records", "not-a-hypercore-key"), /64-character hexadecimal/);
  } finally {
    await corestore.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("replicates deterministic immutable records between independent Corestores", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-record-replication-"));
  const firstCorestore = new Corestore(join(directory, "first"));
  const secondCorestore = new Corestore(join(directory, "second"));

  try {
    const first = await HypercoreRecordStore.open<TestRecord>(firstCorestore, "generic-records");
    const second = await HypercoreRecordStore.open<TestRecord>(secondCorestore, "generic-records", first.publicKey);
    const firstReplication = firstCorestore.replicate(true);
    const secondReplication = secondCorestore.replicate(false);
    firstReplication.pipe(secondReplication).pipe(firstReplication);

    await first.append(record("record-a", "First record"));
    await first.append(record("record-b", "Second record"));
    await waitForLength(second, 2);

    assert.equal(second.publicKey, first.publicKey);
    assert.deepEqual(await second.readAll(), [record("record-a", "First record"), record("record-b", "Second record")]);

    await firstReplication.destroy();
    await secondReplication.destroy();
  } finally {
    await firstCorestore.close();
    await secondCorestore.close();
    await rm(directory, { recursive: true, force: true });
  }
});
