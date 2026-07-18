import assert from "node:assert/strict";
import test from "node:test";
import { settlementLifecycleMessage, settlementProgress } from "../src/renderer/components/records/settlementPresentation.js";

const proposal = { id: "proposal-1", providerMemberId: "provider", receiverMemberId: "receiver", minutes: 60 };

test("settlement presentation keeps acknowledgement, dual confirmation, and local settlement distinct", () => {
  assert.equal(settlementProgress(proposal, undefined, "provider", []).lifecycle, "ready-to-acknowledge");
  assert.equal(settlementProgress(proposal, { proposalId: proposal.id, status: "awaiting-counterparty", acknowledgements: [{ acknowledgedByMemberId: "provider" }] }, "provider", []).lifecycle, "awaiting-counterparty");
  assert.equal(settlementProgress(proposal, { proposalId: proposal.id, status: "dual-confirmed", acknowledgements: [{ acknowledgedByMemberId: "provider" }, { acknowledgedByMemberId: "receiver" }] }, "provider", []).lifecycle, "dual-confirmed");
  assert.equal(settlementProgress(proposal, undefined, "provider", [proposal.id]).lifecycle, "settled");
  assert.match(settlementLifecycleMessage("settled"), /not a claim of durable replication or network finality/i);
});
