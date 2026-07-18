import assert from "node:assert/strict";
import test from "node:test";
import { settlementLifecycleMessage, settlementProgress } from "../src/renderer/components/records/settlementPresentation.js";

const proposal = { id: "proposal-1", providerMemberId: "provider", receiverMemberId: "receiver", minutes: 60 };

test("settlement presentation keeps acknowledgements, attestations, and local ledger admission distinct", () => {
  const awaiting = { proposalId: proposal.id, status: "awaiting-counterparty" as const, acknowledgements: [{ acknowledgedByMemberId: "provider" }] };
  const dualConfirmed = { proposalId: proposal.id, status: "dual-confirmed" as const, acknowledgements: [{ acknowledgedByMemberId: "provider" }, { acknowledgedByMemberId: "receiver" }] };

  assert.equal(settlementProgress(proposal, undefined, undefined, "provider", []).lifecycle, "ready-to-acknowledge");
  assert.equal(settlementProgress(proposal, awaiting, undefined, "provider", []).lifecycle, "awaiting-counterparty");
  assert.equal(settlementProgress(proposal, dualConfirmed, undefined, "provider", []).lifecycle, "ready-to-attest");
  assert.equal(settlementProgress(proposal, dualConfirmed, { proposalId: proposal.id, attestations: [{ memberId: "provider" }] }, "provider", []).lifecycle, "awaiting-counterparty-attestation");
  assert.equal(settlementProgress(proposal, dualConfirmed, { proposalId: proposal.id, attestations: [{ memberId: "provider" }, { memberId: "receiver" }] }, "provider", []).lifecycle, "ready-to-publish");
  assert.equal(settlementProgress(proposal, undefined, undefined, "provider", [proposal.id]).lifecycle, "locally-admitted");
  assert.match(settlementLifecycleMessage("locally-admitted"), /not a claim of durable replication or network finality/i);
});
