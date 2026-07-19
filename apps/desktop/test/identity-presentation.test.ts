import assert from "node:assert/strict";
import test from "node:test";
import { communityScopeLabel, identityPresentation } from "../src/renderer/components/records/identityPresentation.js";
import { recordsTrustStatus } from "../src/renderer/components/records/recordsTrustPresentation.js";

test("identity presentation distinguishes ready, recoverable, and blocked membership states", () => {
  assert.equal(identityPresentation({ state: "ready" }).tone, "ready");
  assert.match(identityPresentation({ state: "not-created" }).detail, /does not create an offer, request, or completed exchange/i);
  assert.equal(identityPresentation({ state: "unavailable" }).tone, "blocked");
});

test("community scope copy treats the identifier as public community information", () => {
  assert.match(communityScopeLabel("community-1"), /public community information/i);
  assert.match(communityScopeLabel(null), /not reported/i);
});

test("records trust copy never upgrades visible activity to settlement finality", () => {
  const ready = recordsTrustStatus({ state: "ready", publishedListings: [], proposedProposals: [], acceptedProposals: [], settlementConfirmations: [], settlementAttestations: [], settledProposalIds: [], settlementDurability: [], transferCount: 0 }, 2);
  assert.equal(ready.tone, "ready");
  assert.match(ready.detail, /does not by itself prove that another peer has received it or that an exchange is complete/i);

  const rejected = recordsTrustStatus({ state: "rejected", reason: "signature mismatch" }, 1);
  assert.equal(rejected.tone, "blocked");
  assert.match(rejected.detail, /signature mismatch/);
});
