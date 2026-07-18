import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { type ExchangeProposal } from "@peer-hours/timebank-domain";
import {
  canonicalTransferPayload,
  createMemberSigningKeyAuthorizationEvent,
  transferPayloadDigest,
} from "@peer-hours/timebank-identity";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import {
  memberSigningKeyAuthorizationEventToRecord,
  resolveTimebankRecords,
  toAcceptedExchangeProposalRecord,
  toLedgerTransferRecord,
  type RecordEnvelope,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const providerMemberId = "member-provider";
const recipientMemberId = "member-recipient";
const metadata = { occurredAt: "2026-07-18T13:00:00.000Z", authorId: providerMemberId };

/** Exports an ephemeral Ed25519 public key as the PEM used by identity records. */
function publicKeyPem(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): string {
  return key.export({ format: "pem", type: "spki" }).toString();
}

/** Builds the accepted proposal that a normal transfer must settle exactly. */
function proposal(): ExchangeProposal {
  return {
    id: "proposal-garden-help",
    communityId,
    offerId: "offer-garden-help",
    requestId: "request-garden-help",
    providerMemberId,
    receiverMemberId: recipientMemberId,
    creatorMemberId: providerMemberId,
    acceptedByMemberId: recipientMemberId,
    minutes: 90,
    status: "accepted",
  };
}

/** Creates the two signed attestations over immutable transfer terms. */
function signedTransfer(
  providerPrivateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  recipientPrivateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  overrides: Partial<Transfer> = {},
): Transfer {
  const unsigned = createTransfer({
    id: "transfer-garden-help",
    communityId,
    sourceProposalId: proposal().id,
    providerMemberId,
    recipientMemberId,
    minutes: 90,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest: "placeholder", signature: "placeholder" },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: "placeholder", signature: "placeholder" },
    ],
    ...overrides,
  });
  const digest = transferPayloadDigest(unsigned);
  return createTransfer({
    ...unsigned,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest: digest, signature: sign(null, canonicalTransferPayload(unsigned), providerPrivateKey).toString("base64url") },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: digest, signature: sign(null, canonicalTransferPayload(unsigned), recipientPrivateKey).toString("base64url") },
    ],
  });
}

test("resolves unordered replicated key, proposal, and transfer records into deterministic balances", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const transfer = signedTransfer(providerKeys.privateKey, recipientKeys.privateKey);
  const records: readonly RecordEnvelope[] = [
    toLedgerTransferRecord(transfer, { ...metadata, occurredAt: "2026-07-18T13:02:00.000Z" }),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
    toAcceptedExchangeProposalRecord(proposal(), { ...metadata, occurredAt: "2026-07-18T13:01:00.000Z" }),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
  ];

  const state = resolveTimebankRecords(communityId, [records[0], records[3], records[1], records[2], records[0]]);
  assert.deepEqual(state.ledger.balances, { [providerMemberId]: 90, [recipientMemberId]: -90 });
  assert.equal(state.acceptedProposals.length, 1);
  assert.equal(state.authorizations.filter(({ active }) => active).length, 2);
});

test("rejects a transfer whose accepted proposal is absent or whose terms differ", () => {
  const providerKeys = generateKeyPairSync("ed25519");
  const recipientKeys = generateKeyPairSync("ed25519");
  const transfer = signedTransfer(providerKeys.privateKey, recipientKeys.privateKey, { minutes: 60 });
  const records: readonly RecordEnvelope[] = [
    toLedgerTransferRecord(transfer, { ...metadata, occurredAt: "2026-07-18T13:02:00.000Z" }),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "provider-key-activation", communityId, memberId: providerMemberId, keyId: "provider-key", action: "activate", occurredAt: "2026-07-18T13:00:00.000Z", publicKeyPem: publicKeyPem(providerKeys.publicKey),
    })),
    memberSigningKeyAuthorizationEventToRecord(createMemberSigningKeyAuthorizationEvent({
      eventId: "recipient-key-activation", communityId, memberId: recipientMemberId, keyId: "recipient-key", action: "activate", occurredAt: "2026-07-18T13:00:01.000Z", publicKeyPem: publicKeyPem(recipientKeys.publicKey),
    })),
  ];

  assert.throws(() => resolveTimebankRecords(communityId, records));
  assert.throws(() => resolveTimebankRecords(communityId, [...records, toAcceptedExchangeProposalRecord(proposal(), metadata)]));
});
