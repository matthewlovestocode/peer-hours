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
import { PeerRuntime } from "@peer-hours/peer-runtime";
import Corestore from "corestore";
import { createNodeServer } from "../src/server.js";

type ReplicatingCorestore = {
  replicate(initiator: boolean): NodeJS.ReadWriteStream;
};

type RuntimeInternals = {
  readonly store: ReplicatingCorestore;
  readonly bootstrapCore: { peers: readonly unknown[] };
};

type TestRecord = {
  readonly id: string;
  readonly schema: "peer-hours/record";
  readonly version: 1;
  readonly kind: "test.multi-node-resilience";
  readonly communityId: "peer-hours/test/multi-node";
  readonly occurredAt: string;
  readonly authorId: "member-test";
  readonly payload: { readonly sequence: number };
};

/** Connects two runtimes through their complete Corestores, as a deterministic transport fixture. */
function connect(left: PeerRuntime, right: PeerRuntime): NodeJS.ReadWriteStream[] {
  const leftStream = (left as unknown as RuntimeInternals).store.replicate(true);
  const rightStream = (right as unknown as RuntimeInternals).store.replicate(false);
  leftStream.pipe(rightStream).pipe(leftStream);
  return [leftStream, rightStream];
}

/** Waits for an asynchronous replication condition without assuming a fixed transport delay. */
async function waitUntil(condition: () => Promise<boolean> | boolean, description: string): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (!await condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Builds one signed, short-lived announcement for the member runtime's independently writable feed. */
function memberFeedAnnouncement(runtime: PeerRuntime) {
  const keys = generateKeyPairSync("ed25519");
  const rootPublicKeyPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const memberId = createSelfOwnedMemberIdentity({ rootPublicKeyPem }).memberId;
  const unsignedDeclaration = {
    schema: "peer-hours/member-feed-declaration/v1" as const,
    memberId,
    communityId: "peer-hours/test/multi-node",
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

/** Produces an append-only member record with a distinct observable sequence number. */
function record(sequence: number): TestRecord {
  return {
    id: `resilience-record-${sequence}`,
    schema: "peer-hours/record",
    version: 1,
    kind: "test.multi-node-resilience",
    communityId: "peer-hours/test/multi-node",
    occurredAt: `2026-07-18T12:00:0${sequence}.000Z`,
    authorId: "member-test",
    payload: { sequence },
  };
}

/** Verifies that a restarted community node catches up through a surviving independent community node. */
test("two community nodes retain a member feed through outage, restart, and catch-up", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-multi-node-resilience-"));
  const discoveryStore = new Corestore(join(directory, "discovery"));
  const discoveryCore = discoveryStore.get({ name: "community-discovery", valueEncoding: "json" });
  let member: PeerRuntime | null = null;
  let firstNode: PeerRuntime | null = null;
  let restartedFirstNode: PeerRuntime | null = null;
  let secondNode: PeerRuntime | null = null;
  const streams: NodeJS.ReadWriteStream[] = [];

  try {
    await discoveryCore.ready();
    const discoveryKey = discoveryCore.key.toString("hex");
    await discoveryStore.close();

    member = new PeerRuntime(join(directory, "member"), discoveryKey, undefined, Date.now, false, true);
    firstNode = new PeerRuntime(join(directory, "node-a"), discoveryKey, undefined, Date.now, false, false);
    secondNode = new PeerRuntime(join(directory, "node-b"), discoveryKey, undefined, Date.now, false, false);
    await Promise.all([member.start(), firstNode.start(), secondNode.start()]);
    streams.push(...connect(member, firstNode), ...connect(member, secondNode));

    await waitUntil(
      () => (member as unknown as RuntimeInternals).bootstrapCore.peers.length > 0
        && (firstNode as unknown as RuntimeInternals).bootstrapCore.peers.length > 0
        && (secondNode as unknown as RuntimeInternals).bootstrapCore.peers.length > 0,
      "the member and both community nodes to share discovery",
    );

    await member.appendMemberRecord(record(1));
    member.publishMemberFeedAnnouncement(memberFeedAnnouncement(member));
    await waitUntil(
      async () => (await Promise.all([firstNode!, secondNode!].map(async (node) => {
        const feeds = node.knownMemberFeeds();
        if (!feeds.some((feed) => feed.feedPublicKey === member!.memberRecordFeedKey)) return false;
        return (await node.readMemberRecordsFromFeed(member!.memberRecordFeedKey)).length === 1;
      }))).every(Boolean),
      "both independent community nodes to retain the first member record",
    );

    const firstNodeServer = createNodeServer(firstNode);
    firstNodeServer.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => firstNodeServer.once("listening", resolve));
    const address = firstNodeServer.address();
    assert.ok(address && typeof address !== "string");
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/health`)).status, 200);
    await new Promise<void>((resolve, reject) => firstNodeServer.close((error) => error ? reject(error) : resolve()));

    // Simulate loss of node A while node B remains connected to the member runtime.
    const firstNodeStreams = streams.splice(0, 2);
    await Promise.all(firstNodeStreams.map((stream) => stream.destroy()));
    await firstNode.stop();
    firstNode = null;

    await member.appendMemberRecord(record(2));
    await waitUntil(
      async () => (await secondNode!.readMemberRecordsFromFeed(member!.memberRecordFeedKey)).length === 2,
      "the surviving community node to receive history written during node A's outage",
    );

    restartedFirstNode = new PeerRuntime(join(directory, "node-a"), discoveryKey, undefined, Date.now, false, false);
    await restartedFirstNode.start();
    streams.push(...connect(restartedFirstNode, secondNode));
    await waitUntil(
      async () => (await restartedFirstNode!.readMemberRecordsFromFeed(member!.memberRecordFeedKey)).length === 2,
      "the restarted node to rediscover and catch up through node B",
    );

    assert.deepEqual(await restartedFirstNode.readMemberRecordsFromFeed(member.memberRecordFeedKey), [record(1), record(2)]);
    assert.equal(restartedFirstNode.status().memberFeed.state, "unavailable");
    assert.equal(secondNode.status().memberFeed.state, "unavailable");
  } finally {
    await Promise.all(streams.map((stream) => stream.destroy()));
    await restartedFirstNode?.stop();
    await firstNode?.stop();
    await secondNode?.stop();
    await member?.stop();
    await discoveryStore.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
