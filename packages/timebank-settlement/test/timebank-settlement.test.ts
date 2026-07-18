import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { type ExchangeProposal } from "@peer-hours/timebank-domain";
import {
  canonicalTransferPayload,
  createMemberSigningKeyAuthorization,
  transferPayloadDigest,
  type MemberSigningKeyAuthorization,
} from "@peer-hours/timebank-identity";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import {
  SettlementAcknowledgementRuleError,
  SettlementRuleError,
  createDualConfirmedSettlementTransfer,
  createSettlementAcknowledgement,
  resolveSettlementAcknowledgements,
  settlementTransferId,
  validateAuthorizedDualConfirmedSettlementTransfer,
  validateDualConfirmedSettlementTransfer,
  validateSettlementAcknowledgement,
  validateSettlementTransfer,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const proposal: ExchangeProposal = {
  id: "proposal-garden-help",
  communityId,
  offerId: "offer-garden-help",
  requestId: "request-garden-help",
  providerMemberId: "member-provider",
  receiverMemberId: "member-recipient",
  creatorMemberId: "member-provider",
  acceptedByMemberId: "member-recipient",
  minutes: 90,
  status: "accepted",
};

/** Creates a structurally valid transfer tied to the accepted fixture proposal. */
function settlementTransfer(overrides: Partial<Transfer> = {}): Transfer {
  const terms = {
    id: settlementTransferId(proposal.id),
    communityId,
    sourceProposalId: proposal.id,
    providerMemberId: proposal.providerMemberId,
    recipientMemberId: proposal.receiverMemberId,
    minutes: proposal.minutes,
    ...overrides,
  };

  return createTransfer({
    ...terms,
    attestations: [
      { memberId: terms.providerMemberId, keyId: "provider-key", payloadDigest: "fixture-digest", signature: "provider-signature" },
      { memberId: terms.recipientMemberId, keyId: "recipient-key", payloadDigest: "fixture-digest", signature: "recipient-signature" },
    ],
  });
}

/** Creates a fresh Ed25519 key pair for one cryptographic-attestation test participant. */
function memberKeyPair(): ReturnType<typeof generateKeyPairSync> {
  return generateKeyPairSync("ed25519");
}

/** Creates one active community-scoped authorization for a fixture member key. */
function authorization(
  memberId: string,
  keyId: string,
  publicKey: ReturnType<typeof memberKeyPair>["publicKey"],
): MemberSigningKeyAuthorization {
  return createMemberSigningKeyAuthorization({
    communityId,
    memberId,
    keyId,
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    active: true,
  });
}

/** Signs the deterministic settlement terms with each participant's independent Ed25519 key. */
function cryptographicallyAttestedSettlementTransfer(): {
  readonly transfer: Transfer;
  readonly authorizations: readonly MemberSigningKeyAuthorization[];
} {
  const providerKeys = memberKeyPair();
  const recipientKeys = memberKeyPair();
  const unsigned = settlementTransfer();
  const payloadDigest = transferPayloadDigest(unsigned);
  const transfer = createTransfer({
    ...unsigned,
    attestations: [
      { memberId: proposal.providerMemberId, keyId: "provider-key", payloadDigest, signature: sign(null, canonicalTransferPayload(unsigned), providerKeys.privateKey).toString("base64url") },
      { memberId: proposal.receiverMemberId, keyId: "recipient-key", payloadDigest, signature: sign(null, canonicalTransferPayload(unsigned), recipientKeys.privateKey).toString("base64url") },
    ],
  });
  return {
    transfer,
    authorizations: [
      authorization(proposal.providerMemberId, "provider-key", providerKeys.publicKey),
      authorization(proposal.receiverMemberId, "recipient-key", recipientKeys.publicKey),
    ],
  };
}

test("accepts a settlement transfer that exactly matches an accepted proposal", () => {
  assert.deepEqual(validateSettlementTransfer({ proposal, transfer: settlementTransfer() }), settlementTransfer());
});

test("rejects a transfer for a proposal that is not accepted", () => {
  assert.throws(
    () => validateSettlementTransfer({ proposal: { ...proposal, status: "proposed", acceptedByMemberId: undefined }, transfer: settlementTransfer() }),
    SettlementRuleError,
  );
});

test("rejects mismatched community, source proposal, participants, minutes, and reversal transfers", () => {
  const mismatches: readonly Transfer[] = [
    settlementTransfer({ communityId: "peer-hours/earth/online/software" }),
    settlementTransfer({ sourceProposalId: "another-proposal" }),
    settlementTransfer({ providerMemberId: proposal.receiverMemberId, recipientMemberId: proposal.providerMemberId }),
    settlementTransfer({ minutes: 30 }),
    settlementTransfer({ sourceProposalId: undefined, reversesTransferId: "transfer-before" }),
  ];

  for (const transfer of mismatches) {
    assert.throws(() => validateSettlementTransfer({ proposal, transfer }), SettlementRuleError);
  }
});

test("requires both exchange participants before an acknowledgement state becomes dual-confirmed", () => {
  const providerAcknowledgement = createSettlementAcknowledgement(proposal, proposal.providerMemberId);
  const recipientAcknowledgement = createSettlementAcknowledgement(proposal, proposal.receiverMemberId);

  const pending = resolveSettlementAcknowledgements(proposal, [providerAcknowledgement]);
  assert.equal(pending.status, "awaiting-counterparty");
  assert.equal(pending.acknowledgements.length, 1);

  const confirmed = resolveSettlementAcknowledgements(proposal, [recipientAcknowledgement, providerAcknowledgement]);
  assert.equal(confirmed.status, "dual-confirmed");
  assert.deepEqual(confirmed.acknowledgements.map(({ acknowledgedByMemberId }) => acknowledgedByMemberId), [
    proposal.providerMemberId,
    proposal.receiverMemberId,
  ]);
});

test("rejects outsider, changed-term, or unaccepted-proposal acknowledgements", () => {
  const acknowledgement = createSettlementAcknowledgement(proposal, proposal.providerMemberId);
  assert.throws(
    () => createSettlementAcknowledgement(proposal, "member-outsider"),
    SettlementAcknowledgementRuleError,
  );
  assert.throws(
    () => validateSettlementAcknowledgement(proposal, { ...acknowledgement, minutes: 30 }),
    SettlementAcknowledgementRuleError,
  );
  assert.throws(
    () => createSettlementAcknowledgement({ ...proposal, status: "proposed", acceptedByMemberId: undefined }, proposal.providerMemberId),
    SettlementAcknowledgementRuleError,
  );
});

test("composes the one deterministic settlement transfer only after dual confirmation", () => {
  const acknowledgements = [
    createSettlementAcknowledgement(proposal, proposal.providerMemberId),
    createSettlementAcknowledgement(proposal, proposal.receiverMemberId),
  ];
  const transfer = createDualConfirmedSettlementTransfer({
    proposal,
    acknowledgements,
    attestations: settlementTransfer().attestations,
  });

  assert.equal(transfer.id, settlementTransferId(proposal.id));
  assert.equal(transfer.sourceProposalId, proposal.id);
  assert.equal(transfer.reversesTransferId, undefined);
  assert.deepEqual(transfer.attestations, settlementTransfer().attestations);
});

test("admits only a deterministic transfer backed by both participant acknowledgements", () => {
  const acknowledgements = [
    createSettlementAcknowledgement(proposal, proposal.providerMemberId),
    createSettlementAcknowledgement(proposal, proposal.receiverMemberId),
  ];

  assert.deepEqual(
    validateDualConfirmedSettlementTransfer({ proposal, acknowledgements, transfer: settlementTransfer() }),
    settlementTransfer(),
  );
  assert.throws(
    () => validateDualConfirmedSettlementTransfer({
      proposal,
      acknowledgements,
      transfer: settlementTransfer({ id: "non-deterministic-settlement" }),
    }),
    SettlementRuleError,
  );
});

test("cryptographically admits dual-confirmed settlement terms only with both authorized participant attestations", () => {
  const acknowledgements = [
    createSettlementAcknowledgement(proposal, proposal.providerMemberId),
    createSettlementAcknowledgement(proposal, proposal.receiverMemberId),
  ];
  const { transfer, authorizations } = cryptographicallyAttestedSettlementTransfer();

  assert.deepEqual(
    validateAuthorizedDualConfirmedSettlementTransfer({ proposal, acknowledgements, transfer, authorizations }),
    transfer,
  );
  assert.throws(
    () => validateAuthorizedDualConfirmedSettlementTransfer({
      proposal,
      acknowledgements,
      transfer: {
        ...transfer,
        attestations: [
          { ...transfer.attestations[0]!, signature: "A".repeat(86) },
          transfer.attestations[1]!,
        ],
      },
      authorizations,
    }),
    /valid authorized Ed25519 transfer attestation/i,
  );
  assert.throws(
    () => validateAuthorizedDualConfirmedSettlementTransfer({
      proposal,
      acknowledgements,
      transfer,
      authorizations: authorizations.slice(0, 1),
    }),
    /valid authorized Ed25519 transfer attestation/i,
  );
});

test("refuses transfer composition until the counterparty also acknowledges", () => {
  assert.throws(
    () => createDualConfirmedSettlementTransfer({
      proposal,
      acknowledgements: [createSettlementAcknowledgement(proposal, proposal.providerMemberId)],
      attestations: settlementTransfer().attestations,
    }),
    SettlementRuleError,
  );
});
