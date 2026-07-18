import assert from "node:assert/strict";
import test from "node:test";
import { parseCommunityManifest, parseCommunityPeerRoster } from "../src/index.js";

const coreKey = "a".repeat(64);

/** Creates a complete, structurally valid bootstrap response for parser tests. */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    communityId: "peer-hours/earth/US/CA/east-bay",
    displayName: "East Bay Timebank",
    protocolVersion: 1,
    role: "bootstrap",
    capabilities: ["discovery-metadata"],
    coreKey,
    bootstrapNodes: ["https://node.example.test/bootstrap", "http://127.0.0.1:10001/bootstrap"],
    communityNodeUrl: "https://peer.example.test",
    ...overrides,
  };
}

test("parses complete bootstrap metadata before the runtime uses it", () => {
  assert.deepEqual(parseCommunityManifest(manifest()), {
    communityId: "peer-hours/earth/US/CA/east-bay",
    displayName: "East Bay Timebank",
    protocolVersion: 1,
    role: "bootstrap",
    capabilities: ["discovery-metadata"],
    coreKey,
    bootstrapNodes: ["https://node.example.test/bootstrap", "http://127.0.0.1:10001/bootstrap"],
    communityNodeUrl: "https://peer.example.test/",
  });
});

test("requires nonblank community identity, display name, and core key fields", () => {
  for (const field of ["communityId", "displayName", "coreKey"]) {
    assert.throws(() => parseCommunityManifest(manifest({ [field]: "   " })), new RegExp(`field ${field}`));
  }
});

test("requires the one bootstrap protocol version this runtime supports", () => {
  for (const protocolVersion of [0, -1, 1.5, "1", 2, null]) {
    assert.throws(() => parseCommunityManifest(manifest({ protocolVersion })), /protocolVersion must be the supported version 1/);
  }
});

test("rejects malformed public network core keys", () => {
  assert.throws(() => parseCommunityManifest(manifest({ coreKey: "not-a-key" })), /coreKey must be a 64-character hexadecimal Hypercore key/);
});

test("accepts only the narrow bootstrap role and discovery-metadata capability", () => {
  assert.throws(() => parseCommunityManifest(manifest({ role: "community-peer" })), /role must be bootstrap/);
  assert.throws(() => parseCommunityManifest(manifest({ capabilities: ["admission"] })), /capabilities must be \[discovery-metadata\]/);
  assert.throws(() => parseCommunityManifest(manifest({ role: undefined })), /role must be bootstrap/);
});

test("requires bootstrap nodes to be an array of HTTP(S) URLs", () => {
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: "https://node.example.test" })), /bootstrapNodes must be an array/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: ["file:///private/data"] })), /bootstrapNodes\[0\] must be a valid HTTP\(S\) URL/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: ["not a url"] })), /bootstrapNodes\[0\] must be a valid HTTP\(S\) URL/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: Array.from({ length: 17 }, () => "https://bootstrap.example.test") })), /at most 16 URLs/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: ["https://member:secret@bootstrap.example.test"] })), /must be a valid HTTP\(S\) URL/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: ["https://bootstrap.example.test/#fragment"] })), /must be a valid HTTP\(S\) URL/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: ["https://bootstrap.example.test", "https://bootstrap.example.test/"] })), /must not contain duplicate URLs/);
});

test("accepts an optional community-peer diagnostics URL but rejects other URL schemes", () => {
  assert.equal(parseCommunityManifest(manifest({ communityNodeUrl: undefined })).communityNodeUrl, null);
  assert.throws(() => parseCommunityManifest(manifest({ communityNodeUrl: "file:///private/data" })), /communityNodeUrl must be a valid HTTP\(S\) URL/);
  assert.throws(() => parseCommunityManifest(manifest({ communityNodeUrl: "https://operator:secret@peer.example.test" })), /communityNodeUrl must be a valid HTTP\(S\) URL/);
});

test("rejects arrays and null rather than treating them as manifest objects", () => {
  assert.throws(() => parseCommunityManifest(null), /must be a JSON object/);
  assert.throws(() => parseCommunityManifest([]), /must be a JSON object/);
});

test("accepts only structurally trustworthy community diagnostics peers", () => {
  assert.deepEqual(parseCommunityPeerRoster({ peers: [{
    id: "community-peer-a",
    connectedAt: "2026-07-18T12:00:00.000Z",
    lastSeenAt: "2026-07-18T12:01:00.000Z",
    lifecycleState: "connected",
    source: "hyperswarm",
  }] }), [{
    id: "community-peer-a",
    connectedAt: "2026-07-18T12:00:00.000Z",
    lastSeenAt: "2026-07-18T12:01:00.000Z",
    lifecycleState: "connected",
    source: "hyperswarm",
  }]);
  assert.deepEqual(parseCommunityPeerRoster({}), []);
  assert.throws(() => parseCommunityPeerRoster({ peers: [{ id: "peer", connectedAt: "not-a-time", lastSeenAt: "2026-07-18T12:01:00.000Z", lifecycleState: "connected" }] }), /canonical ISO timestamp/);
  assert.throws(() => parseCommunityPeerRoster({ peers: [{ id: "peer", connectedAt: "2026-07-18T12:00:00.000Z", lastSeenAt: "2026-07-18T12:01:00.000Z", lifecycleState: "unknown" }] }), /invalid lifecycle state/);
});

test("rejects ambiguous or noncanonical community diagnostics identities and timestamps", () => {
  const peer = { id: "community-peer-a", connectedAt: "2026-07-18T12:00:00.000Z", lastSeenAt: "2026-07-18T12:01:00.000Z", lifecycleState: "connected" };
  assert.throws(() => parseCommunityPeerRoster({ peers: [peer, peer] }), /duplicate peer ids/);
  assert.throws(() => parseCommunityPeerRoster({ peers: [{ ...peer, id: "x".repeat(257) }] }), /no longer than 256/);
  assert.throws(() => parseCommunityPeerRoster({ peers: [{ ...peer, connectedAt: "2026-07-18T12:00:00Z" }] }), /canonical ISO timestamp/);
  assert.throws(() => parseCommunityPeerRoster({ peers: Array.from({ length: 257 }, (_, index) => ({ ...peer, id: `peer-${index}` })) }), /at most 256 entries/);
});
