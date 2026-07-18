import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canonicalMemberFeedAnnouncementPayload,
  canonicalMemberFeedDeclarationPayload,
  createMemberFeedAnnouncement,
  createMemberFeedDeclaration,
  createSelfOwnedMemberIdentity,
} from "@peer-hours/timebank-identity";
import Corestore from "corestore";
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
  readonly bootstrapCore: { peers: readonly unknown[] };
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

/** Waits for an asynchronous direct replication condition without relying on a community peer. */
async function waitUntil(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Builds a valid short-lived announcement for the member runtime's own independently writable feed. */
function memberFeedAnnouncement(runtime: PeerRuntime) {
  const keys = generateKeyPairSync("ed25519");
  const rootPublicKeyPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem }).memberId;
  const unsignedDeclaration = {
    schema: "peer-hours/member-feed-declaration/v1" as const,
    memberId,
    communityId: "peer-hours/earth/test",
    feedPublicKey: runtime.memberRecordFeedKey,
    occurredAt: "2026-07-18T12:00:00.000Z",
    rootPublicKeyPem,
  };
  const declaration = createMemberFeedDeclaration({
    ...unsignedDeclaration,
    signature: sign(null, canonicalMemberFeedDeclarationPayload(unsignedDeclaration), keys.privateKey).toString("base64url"),
  });
  const unsignedAnnouncement = {
    schema: "peer-hours/member-feed-announcement/v1" as const,
    declaration,
    announcedAt: "2026-07-18T12:00:00.000Z",
    expiresAt: "2026-07-19T12:00:00.000Z",
  };
  return createMemberFeedAnnouncement({
    ...unsignedAnnouncement,
    signature: sign(null, canonicalMemberFeedAnnouncementPayload(unsignedAnnouncement), keys.privateKey).toString("base64url"),
  });
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

test("discovers and replicates a signed member feed over a shared discovery core without a community peer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-runtime-discovery-"));
  const bootstrapStore = new Corestore(join(directory, "discovery-scope"));
  const discoveryCore = bootstrapStore.get({ name: "peer-hours-discovery-scope", valueEncoding: "json" });
  let first: PeerRuntime | null = null;
  let second: PeerRuntime | null = null;
  let firstReplication: NodeJS.ReadWriteStream | null = null;
  let secondReplication: NodeJS.ReadWriteStream | null = null;

  try {
    await discoveryCore.ready();
    const discoveryKey = discoveryCore.key.toString("hex");
    await bootstrapStore.close();
    first = new PeerRuntime(join(directory, "first"), discoveryKey, undefined, Date.now, false);
    second = new PeerRuntime(join(directory, "second"), discoveryKey, undefined, Date.now, false);
    await first.start();
    await second.start();
    firstReplication = (first as unknown as RuntimeInternals).store.replicate(true);
    secondReplication = (second as unknown as RuntimeInternals).store.replicate(false);
    firstReplication.pipe(secondReplication).pipe(firstReplication);
    await waitUntil(
      () => (first as unknown as RuntimeInternals).bootstrapCore.peers.length > 0
        && (second as unknown as RuntimeInternals).bootstrapCore.peers.length > 0,
      "the shared discovery core to connect",
    );

    await first.appendMemberRecord(envelope("automatically-discovered", "Found through a signed feed announcement"));
    const announcement = memberFeedAnnouncement(first);
    first.publishMemberFeedAnnouncement(announcement);

    await waitUntil(
      () => second?.knownMemberFeeds().some(({ feedPublicKey }) => feedPublicKey === first?.memberRecordFeedKey) ?? false,
      "the remote member feed announcement",
    );
    assert.deepEqual(
      await waitForMemberFeedRecords(second, first.memberRecordFeedKey, 1),
      [envelope("automatically-discovered", "Found through a signed feed announcement")],
    );
    assert.equal(first.status().listening, false);
    assert.equal(second.status().listening, false);
    assert.equal(second.status().bootstrap.url, null);
  } finally {
    await firstReplication?.destroy();
    await secondReplication?.destroy();
    await second?.stop();
    await first?.stop();
    await bootstrapStore.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
