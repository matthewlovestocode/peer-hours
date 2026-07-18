import assert from "node:assert/strict";
import test from "node:test";
import { communityScopeLabel, identityPresentation } from "../src/renderer/components/records/identityPresentation.js";
import { recordsTrustStatus } from "../src/renderer/components/records/recordsTrustPresentation.js";

test("identity presentation distinguishes ready, recoverable, and blocked signing states", () => {
  assert.equal(identityPresentation({ state: "ready" }).tone, "ready");
  assert.match(identityPresentation({ state: "not-created" }).detail, /does not publish/i);
  assert.equal(identityPresentation({ state: "unavailable" }).tone, "blocked");
});

test("community scope copy treats the identifier as public verification context", () => {
  assert.match(communityScopeLabel("community-1"), /public routing/i);
  assert.match(communityScopeLabel(null), /cannot yet be confirmed/i);
});

test("records trust copy never upgrades raw history to settlement finality", () => {
  const ready = recordsTrustStatus({ state: "ready", publishedListings: [], proposedProposals: [], acceptedProposals: [], settlementConfirmations: [], settledProposalIds: [], transferCount: 0 }, 2);
  assert.equal(ready.tone, "ready");
  assert.match(ready.detail, /not a claim of replication or settlement finality/i);

  const rejected = recordsTrustStatus({ state: "rejected", reason: "signature mismatch" }, 1);
  assert.equal(rejected.tone, "blocked");
  assert.match(rejected.detail, /signature mismatch/);
});
