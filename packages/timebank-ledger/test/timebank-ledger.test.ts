import assert from "node:assert/strict";
import test from "node:test";
import {
  LedgerRuleError,
  applyTransfers,
  createTransfer,
  type Transfer,
  type TransferAttestation,
} from "../src/index.js";

const communityId = "peer-hours/earth/US/CA/east-bay";
const anotherCommunityId = "peer-hours/earth/online/software";
const providerMemberId = "member-provider";
const recipientMemberId = "member-recipient";

/** Creates a signature fixture accepted by the verifier used in these tests. */
function attestation(memberId: string, signature = `valid:${memberId}`): TransferAttestation {
  return { memberId, keyId: `${memberId}-key`, payloadDigest: "fixture-payload-digest", signature };
}

/** Creates a structurally valid transfer fixture with both participant attestations. */
function transfer(overrides: Partial<Transfer> = {}): Transfer {
  const source = {
    id: "transfer-garden-help",
    communityId,
    sourceProposalId: "proposal-garden-help",
    providerMemberId,
    recipientMemberId,
    minutes: 90,
    attestations: [attestation(providerMemberId), attestation(recipientMemberId)],
    ...overrides,
  };

  return createTransfer(source);
}

/** Accepts only the fixture signature belonging to the attesting participant. */
function verifyFixtureAttestation(input: { readonly attestation: TransferAttestation }): boolean {
  return input.attestation.signature === `valid:${input.attestation.memberId}`;
}

test("rejects self transfers and invalid positive integer minute amounts", () => {
  for (const minutes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => transfer({ id: `invalid-${String(minutes)}`, minutes }), LedgerRuleError);
  }

  assert.throws(() => transfer({ providerMemberId: recipientMemberId }), LedgerRuleError);
});

test("rejects a transfer scoped to a different community than its ledger", () => {
  assert.throws(
    () => applyTransfers({ communityId, transfers: [transfer({ communityId: anotherCommunityId })], verifyAttestation: verifyFixtureAttestation }),
    LedgerRuleError,
  );
});

test("requires exactly one provider and one recipient attestation", () => {
  assert.throws(() => transfer({ attestations: [attestation(providerMemberId)] }), LedgerRuleError);
  assert.throws(
    () => transfer({ attestations: [attestation(providerMemberId), attestation(providerMemberId)] }),
    LedgerRuleError,
  );
  assert.throws(
    () => transfer({ attestations: [attestation(providerMemberId), attestation("unrelated-member")] }),
    LedgerRuleError,
  );
});

test("requires each participant attestation to identify its signing key and signed payload digest", () => {
  assert.throws(
    () => transfer({ attestations: [{ memberId: providerMemberId, keyId: "provider-key", payloadDigest: "", signature: "valid:provider" }, attestation(recipientMemberId)] }),
    LedgerRuleError,
  );
  assert.throws(
    () => transfer({ attestations: [{ memberId: providerMemberId, keyId: "", payloadDigest: "fixture-payload-digest", signature: "valid:provider" }, attestation(recipientMemberId)] }),
    LedgerRuleError,
  );
});

test("does not settle a transfer when either participant attestation fails verification", () => {
  const invalidTransfer = transfer({
    attestations: [attestation(providerMemberId), attestation(recipientMemberId, "not-a-valid-signature")],
  });

  assert.throws(
    () => applyTransfers({ communityId, transfers: [invalidTransfer], verifyAttestation: verifyFixtureAttestation }),
    LedgerRuleError,
  );
});

test("derives equal-and-opposite postings and balances from a verified transfer", () => {
  const ledger = applyTransfers({ communityId, transfers: [transfer()], verifyAttestation: verifyFixtureAttestation });

  assert.deepEqual(ledger.postings, [
    { transferId: "transfer-garden-help", memberId: providerMemberId, minutes: 90 },
    { transferId: "transfer-garden-help", memberId: recipientMemberId, minutes: -90 },
  ]);
  assert.deepEqual(ledger.balances, { [providerMemberId]: 90, [recipientMemberId]: -90 });
});

test("applies an identical transfer idempotently", () => {
  const settled = transfer();
  const ledger = applyTransfers({ communityId, transfers: [settled, settled], verifyAttestation: verifyFixtureAttestation });

  assert.equal(ledger.transfers.length, 1);
  assert.deepEqual(ledger.balances, { [providerMemberId]: 90, [recipientMemberId]: -90 });
});

test("rejects two settlements for the same accepted proposal", () => {
  const first = transfer();
  const second = transfer({ id: "transfer-garden-help-duplicate" });

  assert.throws(
    () => applyTransfers({ communityId, transfers: [first, second], verifyAttestation: verifyFixtureAttestation }),
    LedgerRuleError,
  );
});

test("derives identical balances when valid transfers arrive in a different order", () => {
  const secondTransfer = transfer({ id: "transfer-computer-help", sourceProposalId: "proposal-computer-help", minutes: 30 });
  const firstOrder = applyTransfers({ communityId, transfers: [transfer(), secondTransfer], verifyAttestation: verifyFixtureAttestation });
  const reverseOrder = applyTransfers({ communityId, transfers: [secondTransfer, transfer()], verifyAttestation: verifyFixtureAttestation });

  assert.deepEqual(reverseOrder.balances, firstOrder.balances);
  assert.deepEqual(reverseOrder.postings, firstOrder.postings);
});

test("accepts an ordinary settlement that reaches the default negative-fifty-hour boundary", () => {
  const boundaryTransfer = transfer({ id: "transfer-credit-boundary", sourceProposalId: "proposal-credit-boundary", minutes: 50 * 60 });

  const ledger = applyTransfers({ communityId, transfers: [boundaryTransfer], verifyAttestation: verifyFixtureAttestation });

  assert.deepEqual(ledger.balances, { [providerMemberId]: 50 * 60, [recipientMemberId]: -50 * 60 });
  assert.deepEqual(ledger.rejectedTransfers, []);
});

test("rejects an ordinary settlement that would cross the minimum balance in deterministic transfer order", () => {
  const boundaryTransfer = transfer({ id: "transfer-a-credit-boundary", sourceProposalId: "proposal-a-credit-boundary", minutes: 50 * 60 });
  const overLimitTransfer = transfer({ id: "transfer-z-over-limit", sourceProposalId: "proposal-z-over-limit", minutes: 1 });

  const firstOrder = applyTransfers({
    communityId,
    transfers: [overLimitTransfer, boundaryTransfer],
    verifyAttestation: verifyFixtureAttestation,
  });
  const reverseOrder = applyTransfers({
    communityId,
    transfers: [boundaryTransfer, overLimitTransfer],
    verifyAttestation: verifyFixtureAttestation,
  });

  assert.deepEqual(firstOrder, reverseOrder);
  assert.deepEqual(firstOrder.transfers.map(({ id }) => id), [boundaryTransfer.id]);
  assert.deepEqual(firstOrder.rejectedTransfers, [{ transfer: overLimitTransfer, reason: "minimum-balance" }]);
  assert.deepEqual(firstOrder.balances, { [providerMemberId]: 50 * 60, [recipientMemberId]: -50 * 60 });
});

test("restores balances through a separately attested compensating reversal", () => {
  const original = transfer({ minutes: 50 * 60 });
  const reversal = transfer({
    id: "transfer-garden-help-reversal",
    providerMemberId: recipientMemberId,
    recipientMemberId: providerMemberId,
    minutes: original.minutes,
    reversesTransferId: original.id,
    sourceProposalId: undefined,
    attestations: [attestation(recipientMemberId), attestation(providerMemberId)],
  });

  const ledger = applyTransfers({ communityId, transfers: [reversal, original], verifyAttestation: verifyFixtureAttestation });
  assert.deepEqual(ledger.balances, { [providerMemberId]: 0, [recipientMemberId]: 0 });
  assert.deepEqual(ledger.transfers.map(({ id }) => id), [original.id, reversal.id]);
  assert.deepEqual(ledger.rejectedTransfers, []);
});

test("does not apply a reversal when its original settlement was rejected by the credit boundary", () => {
  const overLimitOriginal = transfer({ id: "transfer-over-limit-original", sourceProposalId: "proposal-over-limit-original", minutes: 50 * 60 + 1 });
  const reversal = transfer({
    id: "transfer-over-limit-reversal",
    providerMemberId: recipientMemberId,
    recipientMemberId: providerMemberId,
    minutes: overLimitOriginal.minutes,
    reversesTransferId: overLimitOriginal.id,
    sourceProposalId: undefined,
    attestations: [attestation(recipientMemberId), attestation(providerMemberId)],
  });

  const ledger = applyTransfers({ communityId, transfers: [reversal, overLimitOriginal], verifyAttestation: verifyFixtureAttestation });

  assert.deepEqual(ledger.transfers, []);
  assert.deepEqual(ledger.balances, {});
  assert.deepEqual(ledger.rejectedTransfers.map(({ transfer: rejected, reason }) => ({ id: rejected.id, reason })), [
    { id: overLimitOriginal.id, reason: "minimum-balance" },
    { id: reversal.id, reason: "unaccepted-reversal" },
  ]);
});
