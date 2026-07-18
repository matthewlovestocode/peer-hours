import assert from "node:assert/strict";
import test from "node:test";
import type { MemberFeedAnnouncement } from "@peer-hours/timebank-identity";
import type { JsonValue } from "@peer-hours/peer-runtime";
import { MemberIdentityService, type MemberFeedRuntime, type SecureStorageAdapter, type StoredMemberIdentity } from "../src/electron/member-identity.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const feedPublicKey = "a".repeat(64);

/** Provides reversible test encryption while recording protected-key persistence behavior. */
function secureStorage(available = true): SecureStorageAdapter {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(value).toString("base64"),
    decryptString: (value) => Buffer.from(value, "base64").toString(),
  };
}

/** Creates an in-memory store that represents the encrypted identity file owned by Electron main. */
function identityStore(initial: StoredMemberIdentity | null = null) {
  let stored = initial;
  let writes = 0;
  return {
    store: {
      read: async () => stored,
      write: async (identity: StoredMemberIdentity) => { stored = identity; writes += 1; },
    },
    stored: () => stored,
    writes: () => writes,
  };
}

/** Supplies a local member-feed fake and records immutable appends and discovery announcements. */
function memberFeed(config: { readonly communityId?: string | null; readonly records?: readonly JsonValue[] } = {}) {
  const records: JsonValue[] = [...(config.records ?? [])];
  const announcements: MemberFeedAnnouncement[] = [];
  const runtime: MemberFeedRuntime = {
    communityId: () => config.communityId === undefined ? communityId : config.communityId,
    feedPublicKey: () => feedPublicKey,
    readRecords: async () => records,
    appendRecord: async (record) => { records.push(record); return records.length - 1; },
    publishAnnouncement: (announcement) => { announcements.push(announcement); },
  };
  return { runtime, records, announcements };
}

/** Creates the identity service with test-only adapters that never touch Electron or disk. */
function service(input: {
  readonly available?: boolean;
  readonly stored?: StoredMemberIdentity | null;
  readonly communityId?: string | null;
  readonly records?: readonly JsonValue[];
} = {}) {
  const storage = identityStore(input.stored);
  const feed = memberFeed({ communityId: input.communityId, records: input.records });
  return { identity: new MemberIdentityService(secureStorage(input.available), storage.store, feed.runtime), storage, feed };
}

test("first identity creation persists one encrypted key, declaration, and announcement", async () => {
  const fixture = service();

  const status = await fixture.identity.createAndAnnounce();

  assert.equal(status.state, "ready");
  assert.equal(status.communityId, communityId);
  assert.ok(status.memberId);
  assert.equal(fixture.storage.writes(), 1);
  assert.match(fixture.storage.stored()?.privateKeyCiphertext ?? "", /.+/);
  assert.equal(fixture.feed.records.length, 1);
  assert.equal(fixture.feed.announcements.length, 1);
  assert.equal(fixture.feed.announcements[0].declaration.memberId, status.memberId);
});

test("retry reuses the declaration and sends a fresh announcement", async () => {
  const fixture = service();

  await fixture.identity.createAndAnnounce();
  const firstAnnouncement = fixture.feed.announcements[0];
  await fixture.identity.createAndAnnounce();

  assert.equal(fixture.storage.writes(), 1);
  assert.equal(fixture.feed.records.length, 1);
  assert.equal(fixture.feed.announcements.length, 2);
  assert.notEqual(fixture.feed.announcements[1], firstAnnouncement);
  assert.deepEqual(fixture.feed.announcements[1].declaration, firstAnnouncement.declaration);
});

test("restart loads the same member identity from protected persisted material", async () => {
  const first = service();
  const created = await first.identity.createAndAnnounce();
  const restarted = service({ stored: first.storage.stored(), records: first.feed.records });

  const status = await restarted.identity.status();

  assert.equal(status.state, "ready");
  assert.equal(status.memberId, created.memberId);
  assert.equal(restarted.storage.writes(), 0);
});

test("unavailable secure storage creates no identity record or announcement", async () => {
  const fixture = service({ available: false });

  await assert.rejects(fixture.identity.createAndAnnounce(), /secure operating-system key storage is unavailable/i);

  assert.equal(fixture.storage.writes(), 0);
  assert.equal(fixture.feed.records.length, 0);
  assert.equal(fixture.feed.announcements.length, 0);
});

test("an absent bootstrap community creates no identity record or announcement", async () => {
  const fixture = service({ communityId: null });

  await assert.rejects(fixture.identity.createAndAnnounce(), /connect to a bootstrap discovery scope/i);

  assert.equal(fixture.storage.writes(), 0);
  assert.equal(fixture.feed.records.length, 0);
  assert.equal(fixture.feed.announcements.length, 0);
});

test("corrupted identity persistence fails visibly and is never replaced", async () => {
  const fixture = service({ stored: { privateKeyCiphertext: Buffer.from("not-a-private-key").toString("base64"), publicKeyPem: "not-a-pem" } });

  await assert.rejects(fixture.identity.createAndAnnounce(), /stored member identity material is corrupted/i);

  assert.equal(fixture.storage.writes(), 0);
  assert.equal(fixture.feed.records.length, 0);
  assert.equal(fixture.feed.announcements.length, 0);
});
