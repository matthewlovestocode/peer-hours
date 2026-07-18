import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  acceptExchangeProposal,
  createMemberProfile,
  createOffer,
  createRequest,
  proposeExchange,
  publishListing,
} from "@peer-hours/timebank-domain";
import {
  canonicalMemberFeedDeclarationPayload,
  canonicalTransferPayload,
  createMemberFeedDeclaration,
  createSelfOwnedMemberIdentity,
  transferPayloadDigest,
} from "@peer-hours/timebank-identity";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import {
  createDualConfirmedSettlementTransfer,
  createSettlementAcknowledgement,
} from "@peer-hours/timebank-settlement";
import {
  canonicalMemberSignedRecordPayload,
  createMemberSignedRecord,
  memberFeedDeclarationToRecord,
  resolveTimebankMemberFeeds,
  rootKeyIdForMember,
  toAcceptedExchangeProposalRecord,
  toProposedExchangeProposalRecord,
  toSettlementAcknowledgementRecord,
  toLedgerTransferRecord,
  toPublishedListingRecord,
  type RecordEnvelope,
} from "../src/index.js";

type PrivateKey = ReturnType<typeof generateKeyPairSync>["privateKey"];

type ReplicatingCorestore = {
  replicate(initiator: boolean): NodeJS.ReadWriteStream;
};

type RuntimeInternals = {
  readonly store: ReplicatingCorestore;
};

const communityId = "peer-hours/earth/US/CA/east-bay";

/** Exports an ephemeral Ed25519 root public key in the identity protocol's PEM format. */
function publicKeyPem(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): string {
  return key.export({ format: "pem", type: "spki" }).toString();
}

/** Signs one complete immutable envelope using its member's self-owned root key. */
function signedRecord(record: RecordEnvelope, privateKey: PrivateKey, memberId: string) {
  return createMemberSignedRecord({
    ...record,
    signingKeyId: rootKeyIdForMember(memberId),
    signature: sign(null, canonicalMemberSignedRecordPayload(record), privateKey).toString("base64url"),
  });
}

/** Creates the root-signed statement that permits a member feed to carry that member's records. */
function feedDeclaration(memberId: string, rootPublicKeyPem: string, privateKey: PrivateKey, feedPublicKey: string, occurredAt: string) {
  const unsigned = {
    schema: "peer-hours/member-feed-declaration/v1" as const,
    memberId,
    communityId,
    feedPublicKey,
    occurredAt,
    rootPublicKeyPem,
  };
  return createMemberFeedDeclaration({
    ...unsigned,
    signature: sign(null, canonicalMemberFeedDeclarationPayload(unsigned), privateKey).toString("base64url"),
  });
}

/** Builds the exact two-party attested settlement for an accepted proposal. */
function settlementTransfer(
  proposal: ReturnType<typeof acceptExchangeProposal>,
  acknowledgements: readonly ReturnType<typeof createSettlementAcknowledgement>[],
  providerPrivateKey: PrivateKey,
  recipientPrivateKey: PrivateKey,
): Transfer {
  const unsigned = createTransfer({
    id: `${proposal.id}/settlement`,
    communityId,
    sourceProposalId: proposal.id,
    providerMemberId: proposal.providerMemberId,
    recipientMemberId: proposal.receiverMemberId,
    minutes: proposal.minutes,
    attestations: [
      { memberId: proposal.providerMemberId, keyId: rootKeyIdForMember(proposal.providerMemberId), payloadDigest: "pending", signature: "pending" },
      { memberId: proposal.receiverMemberId, keyId: rootKeyIdForMember(proposal.receiverMemberId), payloadDigest: "pending", signature: "pending" },
    ],
  });
  const payloadDigest = transferPayloadDigest(unsigned);
  return createDualConfirmedSettlementTransfer({
    proposal,
    acknowledgements,
    attestations: [
      {
        memberId: proposal.providerMemberId,
        keyId: rootKeyIdForMember(proposal.providerMemberId),
        payloadDigest,
        signature: sign(null, canonicalTransferPayload(unsigned), providerPrivateKey).toString("base64url"),
      },
      {
        memberId: proposal.receiverMemberId,
        keyId: rootKeyIdForMember(proposal.receiverMemberId),
        payloadDigest,
        signature: sign(null, canonicalTransferPayload(unsigned), recipientPrivateKey).toString("base64url"),
      },
    ],
  });
}

/** Waits until a directly replicated remote member feed reaches the expected immutable length. */
async function waitForRemoteRecords(runtime: PeerRuntime, feedKey: string, expectedLength: number): Promise<readonly unknown[]> {
  const deadline = Date.now() + 2_000;
  while (true) {
    const records = await runtime.readMemberRecordsFromFeed(feedKey);
    if (records.length === expectedLength) return records;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${expectedLength} records from ${feedKey}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("two member desktops complete and independently resolve a signed exchange without a community peer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-workflow-"));
  const alice = new PeerRuntime(join(directory, "alice"), undefined, undefined, Date.now, false);
  const bob = new PeerRuntime(join(directory, "bob"), undefined, undefined, Date.now, false);
  let aliceReplication: NodeJS.ReadWriteStream | null = null;
  let bobReplication: NodeJS.ReadWriteStream | null = null;

  try {
    await alice.start();
    await bob.start();
    aliceReplication = (alice as unknown as RuntimeInternals).store.replicate(true);
    bobReplication = (bob as unknown as RuntimeInternals).store.replicate(false);
    aliceReplication.pipe(bobReplication).pipe(aliceReplication);

    const aliceKeys = generateKeyPairSync("ed25519");
    const bobKeys = generateKeyPairSync("ed25519");
    const aliceIdentity = createSelfOwnedMemberIdentity({ rootPublicKeyPem: publicKeyPem(aliceKeys.publicKey) });
    const bobIdentity = createSelfOwnedMemberIdentity({ rootPublicKeyPem: publicKeyPem(bobKeys.publicKey) });
    const aliceProfile = createMemberProfile({ id: aliceIdentity.memberId, communityId, displayName: "Alice" });
    const bobProfile = createMemberProfile({ id: bobIdentity.memberId, communityId, displayName: "Bob" });
    const offer = publishListing({
      listing: createOffer({ id: "offer-garden-help", communityId, memberId: aliceProfile.id, title: "Garden help", minutes: 90 }),
      owner: aliceProfile,
    });
    const request = publishListing({
      listing: createRequest({ id: "request-garden-help", communityId, memberId: bobProfile.id, title: "Garden help", minutes: 90 }),
      owner: bobProfile,
    });
    const proposed = proposeExchange({
      id: "proposal-garden-help", offer, request, provider: aliceProfile, recipient: bobProfile, creatorMemberId: aliceProfile.id, minutes: 90,
    });
    const accepted = acceptExchangeProposal({
      proposal: proposed, offer, request, provider: aliceProfile, recipient: bobProfile, acceptedByMemberId: bobProfile.id,
    });
    const acknowledgements = [
      createSettlementAcknowledgement(accepted, aliceProfile.id),
      createSettlementAcknowledgement(accepted, bobProfile.id),
    ] as const;

    await alice.appendMemberRecord(memberFeedDeclarationToRecord(feedDeclaration(
      aliceProfile.id, aliceIdentity.rootPublicKeyPem, aliceKeys.privateKey, alice.memberRecordFeedKey, "2026-07-18T16:00:00.000Z",
    )));
    await alice.appendMemberRecord(signedRecord(
      toPublishedListingRecord(offer, { occurredAt: "2026-07-18T16:01:00.000Z", authorId: aliceProfile.id }), aliceKeys.privateKey, aliceProfile.id,
    ));
    await alice.appendMemberRecord(signedRecord(
      toProposedExchangeProposalRecord(proposed, { occurredAt: "2026-07-18T16:01:30.000Z", authorId: aliceProfile.id }), aliceKeys.privateKey, aliceProfile.id,
    ));

    await bob.appendMemberRecord(memberFeedDeclarationToRecord(feedDeclaration(
      bobProfile.id, bobIdentity.rootPublicKeyPem, bobKeys.privateKey, bob.memberRecordFeedKey, "2026-07-18T16:00:00.000Z",
    )));
    await bob.appendMemberRecord(signedRecord(
      toPublishedListingRecord(request, { occurredAt: "2026-07-18T16:01:00.000Z", authorId: bobProfile.id }), bobKeys.privateKey, bobProfile.id,
    ));
    await bob.appendMemberRecord(signedRecord(
      toAcceptedExchangeProposalRecord(accepted, { occurredAt: "2026-07-18T16:02:00.000Z", authorId: bobProfile.id }), bobKeys.privateKey, bobProfile.id,
    ));
    await alice.appendMemberRecord(signedRecord(
      toSettlementAcknowledgementRecord(acknowledgements[0], { occurredAt: "2026-07-18T16:02:30.000Z", authorId: aliceProfile.id }), aliceKeys.privateKey, aliceProfile.id,
    ));
    await bob.appendMemberRecord(signedRecord(
      toSettlementAcknowledgementRecord(acknowledgements[1], { occurredAt: "2026-07-18T16:02:30.000Z", authorId: bobProfile.id }), bobKeys.privateKey, bobProfile.id,
    ));

    const [alicePreTransferHistory, bobPreTransferHistory] = await Promise.all([
      waitForRemoteRecords(alice, bob.memberRecordFeedKey, 4),
      waitForRemoteRecords(bob, alice.memberRecordFeedKey, 4),
    ]);
    const alicePreTransferState = resolveTimebankMemberFeeds(communityId, [
      { feedPublicKey: alice.memberRecordFeedKey, records: await alice.readMemberRecords() },
      { feedPublicKey: bob.memberRecordFeedKey, records: alicePreTransferHistory as readonly RecordEnvelope[] },
    ]);
    const bobPreTransferState = resolveTimebankMemberFeeds(communityId, [
      { feedPublicKey: alice.memberRecordFeedKey, records: bobPreTransferHistory as readonly RecordEnvelope[] },
      { feedPublicKey: bob.memberRecordFeedKey, records: await bob.readMemberRecords() },
    ]);
    assert.equal(alicePreTransferState.settlementConfirmations[0]?.status, "dual-confirmed");
    assert.equal(alicePreTransferState.ledger.transfers.length, 0);
    assert.deepEqual(bobPreTransferState.ledger, alicePreTransferState.ledger);

    const transfer = settlementTransfer(accepted, acknowledgements, aliceKeys.privateKey, bobKeys.privateKey);
    await alice.appendMemberRecord(signedRecord(
      toLedgerTransferRecord(transfer, { occurredAt: "2026-07-18T16:03:00.000Z", authorId: aliceProfile.id }), aliceKeys.privateKey, aliceProfile.id,
    ));

    const [aliceHistory, bobHistory] = await Promise.all([
      waitForRemoteRecords(alice, bob.memberRecordFeedKey, 4),
      waitForRemoteRecords(bob, alice.memberRecordFeedKey, 5),
    ]);
    const aliceState = resolveTimebankMemberFeeds(communityId, [
      { feedPublicKey: alice.memberRecordFeedKey, records: await alice.readMemberRecords() },
      { feedPublicKey: bob.memberRecordFeedKey, records: aliceHistory as readonly RecordEnvelope[] },
    ]);
    const bobState = resolveTimebankMemberFeeds(communityId, [
      { feedPublicKey: alice.memberRecordFeedKey, records: bobHistory as readonly RecordEnvelope[] },
      { feedPublicKey: bob.memberRecordFeedKey, records: await bob.readMemberRecords() },
    ]);

    assert.equal(alice.status().bootstrap.state, "not-configured");
    assert.equal(bob.status().bootstrap.state, "not-configured");
    assert.deepEqual(aliceState.publishedListings.map(({ id }) => id), [offer.id, request.id]);
    assert.deepEqual(bobState.publishedListings.map(({ id }) => id), [offer.id, request.id]);
    assert.equal(aliceState.acceptedProposals[0]?.id, accepted.id);
    assert.equal(aliceState.proposedProposals[0]?.id, proposed.id);
    assert.equal(aliceState.settlementConfirmations[0]?.status, "dual-confirmed");
    assert.equal(bobState.transfers[0]?.id, transfer.id);
    assert.deepEqual(aliceState.ledger.balances, {
      [aliceProfile.id]: 90,
      [bobProfile.id]: -90,
    });
    assert.deepEqual(bobState.ledger, aliceState.ledger);
  } finally {
    await aliceReplication?.destroy();
    await bobReplication?.destroy();
    await bob.stop();
    await alice.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
