import assert from "node:assert/strict";
import test from "node:test";
import { resolveBootstrapConfiguration } from "../src/config.js";

const coreKey = "a".repeat(64);

test("resolves complete bootstrap deployment configuration before listening", () => {
  assert.deepEqual(resolveBootstrapConfiguration({
    PORT: "10002",
    COMMUNITY_ID: "peer-hours/test",
    COMMUNITY_NAME: "Test community",
    DISCOVERY_CORE_KEY: coreKey,
    BOOTSTRAP_NODES: "https://one.example.test/bootstrap, https://two.example.test/bootstrap",
    COMMUNITY_NODE_URL: "https://node.example.test/status",
  }), {
    port: 10002,
    manifest: {
      communityId: "peer-hours/test",
      displayName: "Test community",
      protocolVersion: 1,
      role: "bootstrap",
      capabilities: ["discovery-metadata"],
      coreKey,
      bootstrapNodes: ["https://one.example.test/bootstrap", "https://two.example.test/bootstrap"],
      communityNodeUrl: "https://node.example.test/status",
    },
  });
});

test("rejects invalid ports and ambiguous optional bootstrap-node configuration", () => {
  for (const port of ["0", "65536", "100.5", "port"]) {
    assert.throws(() => resolveBootstrapConfiguration({ PORT: port, DISCOVERY_CORE_KEY: coreKey }), /PORT/);
  }
  assert.throws(() => resolveBootstrapConfiguration({ DISCOVERY_CORE_KEY: coreKey, BOOTSTRAP_NODES: "https://one.example.test,,https://two.example.test" }), /BOOTSTRAP_NODES/);
});
