import assert from "node:assert/strict";
import test from "node:test";
import { type ExchangeProposal } from "@peer-hours/timebank-domain";
import { createTransfer, type Transfer } from "@peer-hours/timebank-ledger";
import {
  SettlementAcknowledgementRuleError,
  SettlementRuleError,
  createSettlementAcknowledgement,
  resolveSettlementAcknowledgements,
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
    id: "transfer-garden-help",
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
