import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { applyTransfers, createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import {
  canonicalTransferPayload,
  createEd25519SignatureVerifier,
  createMemberSigningKeyAuthorization,
  transferPayloadDigest,
  type MemberSigningKeyAuthorization,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const anotherCommunityId = "peer-hours/earth/online/software";
const providerMemberId = "member-provider";
const recipientMemberId = "member-recipient";

/** Creates a fresh Ed25519 public/private key pair for one integration-test participant. */
function memberKeyPair(): ReturnType<typeof generateKeyPairSync> {
  return generateKeyPairSync("ed25519");
}

/** Signs an exact canonical transfer payload using an ephemeral Ed25519 private key. */
function signTransfer(transfer: Transfer, privateKey: ReturnType<typeof memberKeyPair>["privateKey"]): string {
  return sign(null, canonicalTransferPayload(transfer), privateKey).toString("base64url");
}

/** Builds a community-scoped authorization from an ephemeral test public key. */
function authorization(input: {
  readonly memberId: string;
  readonly keyId: string;
  readonly publicKey: ReturnType<typeof memberKeyPair>["publicKey"];
  readonly community?: string;
  readonly active?: boolean;
}): MemberSigningKeyAuthorization {
  return createMemberSigningKeyAuthorization({
    communityId: input.community ?? communityId,
    memberId: input.memberId,
    keyId: input.keyId,
    publicKeyPem: input.publicKey.export({ format: "pem", type: "spki" }).toString(),
    active: input.active ?? true,
  });
}

/** Creates a valid unsigned transfer whose exact terms will be signed in each test. */
function unsignedTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return createTransfer({
    id: "transfer-garden-help",
    communityId,
    sourceProposalId: "proposal-garden-help",
    providerMemberId,
    recipientMemberId,
    minutes: 90,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest: "placeholder-payload-digest", signature: "placeholder-provider" },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: "placeholder-payload-digest", signature: "placeholder-recipient" },
    ],
    ...overrides,
  });
}

/** Applies signatures to an otherwise fixed transfer without changing its canonical terms. */
function signedTransfer(input: {
  readonly transfer?: Transfer;
  readonly providerPrivateKey: ReturnType<typeof memberKeyPair>["privateKey"];
  readonly recipientPrivateKey: ReturnType<typeof memberKeyPair>["privateKey"];
}): Transfer {
  const transfer = input.transfer ?? unsignedTransfer();
  const payloadDigest = transferPayloadDigest(transfer);
  return createTransfer({
    ...transfer,
    attestations: [
      { memberId: providerMemberId, keyId: "provider-key", payloadDigest, signature: signTransfer(transfer, input.providerPrivateKey) },
      { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest, signature: signTransfer(transfer, input.recipientPrivateKey) },
    ],
  });
}

test("accepts valid authorized provider and recipient signatures over deterministic transfer terms", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[0] }), true);
  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[1] }), true);
  assert.deepEqual(
    canonicalTransferPayload(transfer),
    canonicalTransferPayload({
      ...transfer,
      attestations: [
        { memberId: providerMemberId, keyId: "provider-key", payloadDigest: transferPayloadDigest(transfer), signature: "different-provider-signature" },
        { memberId: recipientMemberId, keyId: "recipient-key", payloadDigest: transferPayloadDigest(transfer), signature: "different-recipient-signature" },
      ],
    }),
  );
  assert.deepEqual(applyTransfers({ communityId, transfers: [transfer], verifyAttestation }).balances, {
    [providerMemberId]: 90,
    [recipientMemberId]: -90,
  });
});

test("rejects an attestation with a mismatched payload digest or another active key id", () => {
  const providerKeys = memberKeyPair();
  const providerRotatedKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifier = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: providerMemberId, keyId: "provider-rotated-key", publicKey: providerRotatedKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);
  const mismatchedDigest = { ...transfer.attestations[0], payloadDigest: transferPayloadDigest({ ...transfer, minutes: 45 }) };
  const mismatchedKey = { ...transfer.attestations[0], keyId: "provider-rotated-key" };

  assert.equal(verifier({ transfer, attestation: mismatchedDigest }), false);
  assert.equal(verifier({ transfer, attestation: mismatchedKey }), false);
});

test("rejects a valid signature when its key is authorized for another community", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey, community: anotherCommunityId }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[0] }), false);
  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[1] }), true);
});

test("rejects signatures from inactive or unknown keys", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const unknownKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const inactiveVerifier = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey, active: false }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);
  const unknownVerifier = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: unknownKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(inactiveVerifier({ transfer, attestation: transfer.attestations[0] }), false);
  assert.equal(unknownVerifier({ transfer, attestation: transfer.attestations[0] }), false);
});

test("rejects a signature made by a key authorized to a different member", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: recipientKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer, attestation: transfer.attestations[0] }), false);
});

test("rejects a valid signature after any signed transfer term is tampered with", () => {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const transfer = signedTransfer({ providerPrivateKey: providerKeys.privateKey, recipientPrivateKey: recipientKeys.privateKey });
  const tamperedTransfer = createTransfer({ ...transfer, minutes: transfer.minutes + 1 });
  const verifyAttestation = createEd25519SignatureVerifier([
    authorization({ memberId: providerMemberId, keyId: "provider-key", publicKey: providerKeys.publicKey }),
    authorization({ memberId: recipientMemberId, keyId: "recipient-key", publicKey: recipientKeys.publicKey }),
  ]);

  assert.equal(verifyAttestation({ transfer: tamperedTransfer, attestation: tamperedTransfer.attestations[0] }), false);
  assert.equal(verifyAttestation({ transfer: tamperedTransfer, attestation: tamperedTransfer.attestations[1] }), false);
});
