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

/** Waits for a known remote member feed to expose a replicated immutable record sequence. */
async function waitForMemberFeedRecords(runtime: PeerRuntime, feedPublicKey: string, expectedLength: number): Promise<readonly unknown[]> {
  const deadline = Date.now() + 2_000;
  while (true) {
    const records = await runtime.readMemberRecordsFromFeed(feedPublicKey);
    if (records.length === expectedLength) return records;
    if (Date.now() >= deadline) throw new Error(`Replication timed out waiting for ${expectedLength} member-feed records`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("keeps member-authored records in a separately writable feed that another runtime can replicate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-runtime-member-feed-"));
  const first = new PeerRuntime(join(directory, "first"), undefined, undefined, Date.now, false);
  const second = new PeerRuntime(join(directory, "second"), undefined, undefined, Date.now, false);
  let firstReplication: NodeJS.ReadWriteStream | null = null;
  let secondReplication: NodeJS.ReadWriteStream | null = null;

  try {
    await first.start();
    await second.start();
    assert.match(first.memberRecordFeedKey, /^[a-f0-9]{64}$/);
    await second.readMemberRecordsFromFeed(first.memberRecordFeedKey);

    firstReplication = (first as unknown as RuntimeInternals).store.replicate(true);
    secondReplication = (second as unknown as RuntimeInternals).store.replicate(false);
    firstReplication.pipe(secondReplication).pipe(firstReplication);

    await first.appendMemberRecord(envelope("member-record-a", "Member-owned immutable record"));
    assert.deepEqual(await waitForMemberFeedRecords(second, first.memberRecordFeedKey, 1), [
      envelope("member-record-a", "Member-owned immutable record"),
    ]);
    assert.deepEqual(await first.readMemberRecords(), [envelope("member-record-a", "Member-owned immutable record")]);
  } finally {
    await firstReplication?.destroy();
    await secondReplication?.destroy();
    await second.stop();
    await first.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("preserves a member-owned feed and its immutable records across a local runtime restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-runtime-member-feed-restart-"));
  const runtimeDirectory = join(directory, "member");
  const first = new PeerRuntime(runtimeDirectory, undefined, undefined, Date.now, false);
  let second: PeerRuntime | null = null;

  try {
    await first.start();
    const feedKey = first.memberRecordFeedKey;
    await first.appendMemberRecord(envelope("member-record-restart", "Survives restart"));
    await first.stop();

    second = new PeerRuntime(runtimeDirectory, undefined, undefined, Date.now, false);
    await second.start();
    assert.equal(second.memberRecordFeedKey, feedKey);
    assert.deepEqual(await second.readMemberRecords(), [envelope("member-record-restart", "Survives restart")]);
  } finally {
    await second?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
