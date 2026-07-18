import assert from "node:assert/strict";
import test from "node:test";
import { parseCommunityManifest } from "../src/index.js";

const coreKey = "a".repeat(64);
const recordCoreKey = "b".repeat(64);

/** Creates a complete, structurally valid bootstrap response for parser tests. */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    communityId: "peer-hours/earth/US/CA/east-bay",
    displayName: "East Bay Timebank",
    protocolVersion: 1,
    coreKey,
    recordCoreKey,
    bootstrapNodes: ["https://node.example.test/bootstrap", "http://127.0.0.1:10000/bootstrap"],
    ...overrides,
  };
}

test("parses complete bootstrap metadata before the runtime uses it", () => {
  assert.deepEqual(parseCommunityManifest(manifest()), {
    communityId: "peer-hours/earth/US/CA/east-bay",
    displayName: "East Bay Timebank",
    protocolVersion: 1,
    coreKey,
    recordCoreKey,
    bootstrapNodes: ["https://node.example.test/bootstrap", "http://127.0.0.1:10000/bootstrap"],
  });
});

test("requires nonblank community identity, display name, and core key fields", () => {
  for (const field of ["communityId", "displayName", "coreKey"]) {
    assert.throws(() => parseCommunityManifest(manifest({ [field]: "   " })), new RegExp(`field ${field}`));
  }
});

test("requires a positive integer protocol version", () => {
  for (const protocolVersion of [0, -1, 1.5, "1", null]) {
    assert.throws(() => parseCommunityManifest(manifest({ protocolVersion })), /protocolVersion must be a positive integer/);
  }
});

test("rejects malformed public keys including an optional record core key", () => {
  assert.throws(() => parseCommunityManifest(manifest({ coreKey: "not-a-key" })), /coreKey must be a 64-character hexadecimal Hypercore key/);
  assert.throws(() => parseCommunityManifest(manifest({ recordCoreKey: "not-a-key" })), /recordCoreKey must be a 64-character hexadecimal Hypercore key/);
});

test("accepts omitted record core keys but rejects invalid provided values", () => {
  const parsed = parseCommunityManifest(manifest({ recordCoreKey: undefined }));
  assert.equal(parsed.recordCoreKey, undefined);
  assert.throws(() => parseCommunityManifest(manifest({ recordCoreKey: null })), /recordCoreKey must be a 64-character hexadecimal Hypercore key when provided/);
});

test("requires bootstrap nodes to be an array of HTTP(S) URLs", () => {
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: "https://node.example.test" })), /bootstrapNodes must be an array/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: ["file:///private/data"] })), /bootstrapNodes\[0\] must be a valid HTTP\(S\) URL/);
  assert.throws(() => parseCommunityManifest(manifest({ bootstrapNodes: ["not a url"] })), /bootstrapNodes\[0\] must be a valid HTTP\(S\) URL/);
});

test("rejects arrays and null rather than treating them as manifest objects", () => {
  assert.throws(() => parseCommunityManifest(null), /must be a JSON object/);
  assert.throws(() => parseCommunityManifest([]), /must be a JSON object/);
});
