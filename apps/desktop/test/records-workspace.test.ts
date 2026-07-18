import assert from "node:assert/strict";
import test from "node:test";
import { readRecordsWorkspace, recordsWorkspaceErrorMessage } from "../src/renderer/components/records/recordsWorkspace.js";

/** Builds the renderer's minimum local-read boundary without Electron or a browser runtime. */
function reader(overrides: Partial<Parameters<typeof readRecordsWorkspace>[0]> = {}) {
  return {
    getMemberRecords: async () => [{ id: "raw-1" }],
    getMemberIdentityStatus: async () => ({ state: "ready" as const, memberId: "member-1", communityId: "community-1" }),
    getResolvedMemberState: async () => ({ state: "ready" as const, publishedListings: [], proposedProposals: [], acceptedProposals: [], settlementConfirmations: [], transfers: [] }),
    ...overrides,
  };
}

test("records workspace reads raw history, identity, and verifier result as one snapshot", async () => {
  const snapshot = await readRecordsWorkspace(reader());
  assert.deepEqual(snapshot.records, [{ id: "raw-1" }]);
  assert.equal(snapshot.identity.memberId, "member-1");
  assert.equal(snapshot.resolved.state, "ready");
});

test("records workspace does not return a partial snapshot when a dependent local read fails", async () => {
  await assert.rejects(
    readRecordsWorkspace(reader({ getResolvedMemberState: async () => { throw new Error("verification store unavailable"); } })),
    /verification store unavailable/,
  );
});

test("records workspace turns unknown failures into an actionable local recovery message", () => {
  assert.equal(recordsWorkspaceErrorMessage(new Error("storage is locked")), "storage is locked");
  assert.match(recordsWorkspaceErrorMessage("unknown"), /local member feed could not be read/i);
});
