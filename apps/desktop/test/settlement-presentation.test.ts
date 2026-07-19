import assert from "node:assert/strict";
import test from "node:test";
import { settlementDurabilityLifecycle, settlementLifecycleMessage, settlementProgress } from "../src/renderer/components/records/settlementPresentation.js";

const proposal = { id: "proposal-1", providerMemberId: "provider", receiverMemberId: "receiver", minutes: 60 };

test("settlement presentation keeps acknowledgements, attestations, and local ledger admission distinct", () => {
  const awaiting = { proposalId: proposal.id, status: "awaiting-counterparty" as const, acknowledgements: [{ acknowledgedByMemberId: "provider" }] };
  const dualConfirmed = { proposalId: proposal.id, status: "dual-confirmed" as const, acknowledgements: [{ acknowledgedByMemberId: "provider" }, { acknowledgedByMemberId: "receiver" }] };

  assert.equal(settlementProgress(proposal, undefined, undefined, "provider", [], undefined).lifecycle, "ready-to-acknowledge");
  assert.equal(settlementProgress(proposal, awaiting, undefined, "provider", [], undefined).lifecycle, "awaiting-counterparty");
  assert.equal(settlementProgress(proposal, dualConfirmed, undefined, "provider", [], undefined).lifecycle, "ready-to-attest");
  assert.equal(settlementProgress(proposal, dualConfirmed, { proposalId: proposal.id, attestations: [{ memberId: "provider" }] }, "provider", [], undefined).lifecycle, "awaiting-counterparty-attestation");
  assert.equal(settlementProgress(proposal, dualConfirmed, { proposalId: proposal.id, attestations: [{ memberId: "provider" }, { memberId: "receiver" }] }, "provider", [], undefined).lifecycle, "ready-to-publish");
  assert.equal(settlementProgress(proposal, undefined, undefined, "provider", [proposal.id], undefined).lifecycle, "waiting-for-durable-replication");
  assert.equal(settlementProgress(proposal, undefined, undefined, "provider", [proposal.id], { proposalId: proposal.id, verifiedPinnedReceiptCount: 1 }).lifecycle, "durably-replicated");
  assert.equal(settlementProgress(proposal, undefined, undefined, "provider", [proposal.id], { proposalId: proposal.id, verifiedPinnedReceiptCount: 2 }).lifecycle, "resiliently-replicated");
  assert.equal(settlementDurabilityLifecycle(-1), "waiting-for-durable-replication");
  assert.equal(settlementDurabilityLifecycle(1.5), "waiting-for-durable-replication");
  assert.equal(settlementDurabilityLifecycle("2"), "waiting-for-durable-replication");
  assert.match(settlementLifecycleMessage("durably-replicated"), /availability, not validity, balances, or dispute outcomes/i);
});
