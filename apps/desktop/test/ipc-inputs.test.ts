import assert from "node:assert/strict";
import test from "node:test";
import { parseCreateProposalRequest, parseDeviceSigningKeyId, parseListingId, parsePublishListingRequest, parseRecordId } from "../src/electron/ipc-inputs.js";

test("IPC listing validation trims bounded titles and descriptions and accepts whole-minute values", () => {
  assert.deepEqual(parsePublishListingRequest({ kind: "offer", title: "  Garden help  ", description: "  Help with planting.  ", minutes: 90 }), {
    kind: "offer", title: "Garden help", description: "Help with planting.", minutes: 90,
  });
});

test("IPC mutation validation rejects malformed, fractional, and oversized renderer input", () => {
  assert.throws(() => parsePublishListingRequest({ kind: "offer", title: " ", description: "Details", minutes: 60 }), /title/i);
  assert.throws(() => parsePublishListingRequest({ kind: "offer", title: "Garden help", description: " ", minutes: 60 }), /description/i);
  assert.throws(() => parseCreateProposalRequest({ offerId: "offer", requestId: "request", minutes: 1.5 }), /minutes/i);
  assert.throws(() => parseRecordId("x".repeat(513), "Proposal id"), /proposal id/i);
  assert.throws(() => parseCreateProposalRequest(null), /proposal details/i);
  assert.equal(parseListingId("listing-1"), "listing-1");
  assert.throws(() => parseListingId(" "), /listing id/i);
  assert.equal(parseDeviceSigningKeyId("device:rotation-1"), "device:rotation-1");
  assert.throws(() => parseDeviceSigningKeyId("root:member-1"), /device signing key id/i);
});
