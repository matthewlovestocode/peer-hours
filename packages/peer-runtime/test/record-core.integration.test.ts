import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PeerRuntime } from "../src/index.js";

type RecordEnvelope = {
  readonly id: string;
  readonly schema: "peer-hours/record";
  readonly version: 1;
  readonly kind: string;
  readonly communityId: string;
  readonly occurredAt: string;
  readonly authorId: string;
  readonly payload: { readonly title: string };
};

type ReplicatingCorestore = {
  replicate(initiator: boolean): NodeJS.ReadWriteStream;
};

type RuntimeInternals = {
  readonly store: ReplicatingCorestore;
};

/** Creates one canonical JSON envelope for replication without introducing timebank policy. */
function envelope(id: string, title: string): RecordEnvelope {
  return {
    id,
    schema: "peer-hours/record",
    version: 1,
    kind: "test.replication",
    communityId: "peer-hours/earth/test",
    occurredAt: "2026-07-18T12:00:00.000Z",
    authorId: "test-member",
    payload: { title },
  };
}

/** Waits for the remote runtime to resolve a replicated immutable record sequence. */
async function waitForRecords(runtime: PeerRuntime, expectedLength: number): Promise<readonly unknown[]> {
  const deadline = Date.now() + 2_000;
  while (true) {
    const records = await runtime.readRecords();
    if (records.length === expectedLength) return records;
    if (Date.now() >= deadline) throw new Error(`Replication timed out waiting for ${expectedLength} records`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("replicates immutable record envelopes between two Peer Hours runtimes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-runtime-record-core-"));
  const first = new PeerRuntime(join(directory, "first"), undefined, undefined, Date.now, undefined, false);
  let second: PeerRuntime | null = null;
  let firstReplication: NodeJS.ReadWriteStream | null = null;
  let secondReplication: NodeJS.ReadWriteStream | null = null;

  try {
    await first.start();
    assert.match(first.recordCoreKey, /^[a-f0-9]{64}$/);

    second = new PeerRuntime(join(directory, "second"), undefined, undefined, Date.now, first.recordCoreKey, false);
    await second.start();

    firstReplication = (first as unknown as RuntimeInternals).store.replicate(true);
    secondReplication = (second as unknown as RuntimeInternals).store.replicate(false);
    firstReplication.pipe(secondReplication).pipe(firstReplication);

    const source = envelope("record-a", "Shared immutable record");
    assert.equal(await first.appendRecord(source), 0);

    const records = await waitForRecords(second, 1);
    assert.deepEqual(records, [envelope("record-a", "Shared immutable record")]);
    assert.equal(Object.isFrozen(records), true);
    assert.equal(Object.isFrozen(records[0]), true);
    assert.equal(Object.isFrozen(records[0]?.payload), true);
  } finally {
    await firstReplication?.destroy();
    await secondReplication?.destroy();
    await second?.stop();
    await first.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
