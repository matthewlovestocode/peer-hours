import assert from "node:assert/strict";
import test from "node:test";
import { transferPayloadDigest, type MemberFeedAnnouncement } from "@peer-hours/timebank-identity";
import type { JsonValue } from "@peer-hours/peer-runtime";
import {
  decodeAcceptedExchangeProposalRecord,
  decodePublishedListingRecord,
  decodeLedgerTransferRecord,
  decodeSettlementAcknowledgementRecord,
  decodeSettlementTransferAttestationRecord,
} from "@peer-hours/timebank-records";
import { createDualConfirmedSettlementTransferTerms, createSettlementAcknowledgement, createSettlementTransferAttestation } from "@peer-hours/timebank-settlement";
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

test("concurrent identity setup shares one root identity and declaration", async () => {
  const fixture = service();

  const [first, second] = await Promise.all([
    fixture.identity.createAndAnnounce(),
    fixture.identity.createAndAnnounce(),
  ]);

  assert.equal(first.memberId, second.memberId);
  assert.equal(fixture.storage.writes(), 1);
  assert.equal(fixture.feed.records.length, 1);
  assert.equal(fixture.feed.announcements.length, 1);
});

test("publishes a locally signed immutable offer without exposing root key material", async () => {
  const fixture = service();
  await fixture.identity.createAndAnnounce();

  await fixture.identity.publishListing({ kind: "offer", title: "Garden help", minutes: 90 });

  assert.equal(fixture.feed.records.length, 2);
  const record = fixture.feed.records[1] as Parameters<typeof decodePublishedListingRecord>[0];
  assert.deepEqual(decodePublishedListingRecord(record), {
    id: (record as { id: string }).id, communityId, memberId: (record as { authorId: string }).authorId,
    kind: "offer", title: "Garden help", minutes: 90, status: "published",
  });
});

test("rejects an invalid renderer-supplied listing kind without appending a record", async () => {
  const fixture = service();
  await fixture.identity.createAndAnnounce();
  await assert.rejects(fixture.identity.publishListing({ kind: "other", title: "Garden help", minutes: 90 } as never), /offer or request/i);
  assert.equal(fixture.feed.records.length, 1);
});

test("accepts a verified pending proposal only as the other participant and signs a separate record", async () => {
  const fixture = service();
  const status = await fixture.identity.createAndAnnounce();
  const memberId = status.memberId;
  assert.ok(memberId);
  const offer = {
    id: "offer-garden-help", communityId, memberId: "member-provider", kind: "offer" as const,
    title: "Garden help", minutes: 90, status: "published" as const,
  };
  const request = {
    id: "request-garden-help", communityId, memberId, kind: "request" as const,
    title: "Garden help", minutes: 90, status: "published" as const,
  };
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: offer.id, requestId: request.id,
    providerMemberId: offer.memberId, receiverMemberId: request.memberId,
    creatorMemberId: offer.memberId, minutes: 60, status: "proposed" as const,
  };

  await fixture.identity.acceptProposal({ proposal, offer, request });

  assert.equal(fixture.feed.records.length, 2);
  const record = fixture.feed.records[1] as Parameters<typeof decodeAcceptedExchangeProposalRecord>[0];
  assert.deepEqual(decodeAcceptedExchangeProposalRecord(record), {
    ...proposal, acceptedByMemberId: memberId, status: "accepted",
  });
});

test("does not append acceptance when the local member created the pending proposal", async () => {
  const fixture = service();
  const status = await fixture.identity.createAndAnnounce();
  const memberId = status.memberId;
  assert.ok(memberId);
  const offer = {
    id: "offer-garden-help", communityId, memberId, kind: "offer" as const,
    title: "Garden help", minutes: 90, status: "published" as const,
  };
  const request = {
    id: "request-garden-help", communityId, memberId: "member-recipient", kind: "request" as const,
    title: "Garden help", minutes: 90, status: "published" as const,
  };
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: offer.id, requestId: request.id,
    providerMemberId: offer.memberId, receiverMemberId: request.memberId,
    creatorMemberId: memberId, minutes: 60, status: "proposed" as const,
  };

  await assert.rejects(
    fixture.identity.acceptProposal({ proposal, offer, request }),
    /only the other proposal participant/i,
  );
  assert.equal(fixture.feed.records.length, 1);
});

test("signs a participant-owned acknowledgement for an accepted exchange without creating a transfer", async () => {
  const fixture = service();
  const status = await fixture.identity.createAndAnnounce();
  const memberId = status.memberId;
  assert.ok(memberId);
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: "offer-garden-help", requestId: "request-garden-help",
    providerMemberId: "member-provider", receiverMemberId: memberId,
    creatorMemberId: "member-provider", acceptedByMemberId: memberId, minutes: 60, status: "accepted" as const,
  };

  await fixture.identity.acknowledgeSettlement(proposal);

  assert.equal(fixture.feed.records.length, 2);
  const record = fixture.feed.records[1] as Parameters<typeof decodeSettlementAcknowledgementRecord>[0];
  assert.deepEqual(decodeSettlementAcknowledgementRecord(record), {
    id: `${proposal.id}/settlement-ack/${memberId}`, communityId, sourceProposalId: proposal.id,
    providerMemberId: proposal.providerMemberId, recipientMemberId: memberId, minutes: 60, acknowledgedByMemberId: memberId,
  });
});

test("does not append a settlement acknowledgement when the local member is not an exchange participant", async () => {
  const fixture = service();
  await fixture.identity.createAndAnnounce();
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: "offer-garden-help", requestId: "request-garden-help",
    providerMemberId: "member-provider", receiverMemberId: "member-recipient",
    creatorMemberId: "member-provider", acceptedByMemberId: "member-recipient", minutes: 60, status: "accepted" as const,
  };

  await assert.rejects(fixture.identity.acknowledgeSettlement(proposal), /only an exchange participant/i);
  assert.equal(fixture.feed.records.length, 1);
});

test("does not append a duplicate acknowledgement when a repeated local action races the renderer refresh", async () => {
  const fixture = service();
  const status = await fixture.identity.createAndAnnounce();
  const memberId = status.memberId;
  assert.ok(memberId);
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: "offer-garden-help", requestId: "request-garden-help",
    providerMemberId: "member-provider", receiverMemberId: memberId,
    creatorMemberId: "member-provider", acceptedByMemberId: memberId, minutes: 60, status: "accepted" as const,
  };

  await fixture.identity.acknowledgeSettlement(proposal);
  await assert.rejects(fixture.identity.acknowledgeSettlement(proposal), /already acknowledged/i);
  assert.equal(fixture.feed.records.length, 2);
});

test("signs a local transfer attestation and publishes only after both participant attestations are present", async () => {
  const fixture = service();
  const status = await fixture.identity.createAndAnnounce();
  const memberId = status.memberId;
  assert.ok(memberId);
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: "offer-garden-help", requestId: "request-garden-help",
    providerMemberId: "member-provider", receiverMemberId: memberId,
    creatorMemberId: "member-provider", acceptedByMemberId: memberId, minutes: 60, status: "accepted" as const,
  };
  const acknowledgements = [
    createSettlementAcknowledgement(proposal, proposal.providerMemberId),
    createSettlementAcknowledgement(proposal, memberId),
  ];
  const terms = createDualConfirmedSettlementTransferTerms({ proposal, acknowledgements });
  const providerAttestation = createSettlementTransferAttestation({
    proposal,
    acknowledgements,
    attestation: { memberId: proposal.providerMemberId, keyId: "provider-key", payloadDigest: transferPayloadDigest(terms), signature: "A".repeat(86) },
  });

  await fixture.identity.advanceSettlement({ proposal, acknowledgements, attestations: [providerAttestation] });

  assert.equal(fixture.feed.records.length, 3);
  const localAttestation = decodeSettlementTransferAttestationRecord(fixture.feed.records[1]);
  assert.equal(localAttestation.attestation.memberId, memberId);
  const transfer = decodeLedgerTransferRecord(fixture.feed.records[2]);
  assert.equal(transfer.id, `${proposal.id}/settlement`);
  assert.deepEqual(new Set(transfer.attestations.map(({ memberId: attestingMemberId }) => attestingMemberId)), new Set([proposal.providerMemberId, memberId]));
});

test("publishes only the local attestation while a dual-confirmed settlement awaits the counterparty signature", async () => {
  const fixture = service();
  const status = await fixture.identity.createAndAnnounce();
  const memberId = status.memberId;
  assert.ok(memberId);
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: "offer-garden-help", requestId: "request-garden-help",
    providerMemberId: "member-provider", receiverMemberId: memberId,
    creatorMemberId: "member-provider", acceptedByMemberId: memberId, minutes: 60, status: "accepted" as const,
  };
  const acknowledgements = [
    createSettlementAcknowledgement(proposal, proposal.providerMemberId),
    createSettlementAcknowledgement(proposal, memberId),
  ];

  await fixture.identity.advanceSettlement({ proposal, acknowledgements, attestations: [] });

  assert.equal(fixture.feed.records.length, 2);
  assert.equal(decodeSettlementTransferAttestationRecord(fixture.feed.records[1]).attestation.memberId, memberId);
});

test("does not sign or publish a settlement transfer before both participants acknowledge completion", async () => {
  const fixture = service();
  const status = await fixture.identity.createAndAnnounce();
  const memberId = status.memberId;
  assert.ok(memberId);
  const proposal = {
    id: "proposal-garden-help", communityId, offerId: "offer-garden-help", requestId: "request-garden-help",
    providerMemberId: "member-provider", receiverMemberId: memberId,
    creatorMemberId: "member-provider", acceptedByMemberId: memberId, minutes: 60, status: "accepted" as const,
  };

  await assert.rejects(
    fixture.identity.advanceSettlement({ proposal, acknowledgements: [createSettlementAcknowledgement(proposal, memberId)], attestations: [] }),
    /both exchange participants must acknowledge/i,
  );
  assert.equal(fixture.feed.records.length, 1);
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
