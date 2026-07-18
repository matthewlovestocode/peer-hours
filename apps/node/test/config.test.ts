import assert from "node:assert/strict";
import test from "node:test";
import { resolveNodeConfiguration } from "../src/config.js";

test("resolves a development data directory relative to the supplied working directory", () => {
  assert.deepEqual(resolveNodeConfiguration({}, "/srv/peer-hours"), {
    port: 10_000,
    dataDirectory: "/srv/peer-hours/data",
    bootstrapKey: undefined,
    enableDevelopmentPeerRegistration: false,
  });
});

test("resolves an explicit data directory and valid port", () => {
  assert.deepEqual(resolveNodeConfiguration({ DATA_DIR: "/var/lib/peer-hours", PORT: "8080", PEER_HOURS_BOOTSTRAP_KEY: "A".repeat(64), ENABLE_DEV_PEER_REGISTRATION: "true" }, "/srv/peer-hours"), {
    port: 8080,
    dataDirectory: "/var/lib/peer-hours",
    bootstrapKey: "a".repeat(64),
    enableDevelopmentPeerRegistration: true,
  });
});

test("rejects blank data directories and invalid TCP ports before startup", () => {
  assert.throws(() => resolveNodeConfiguration({ DATA_DIR: "   " }), /DATA_DIR/);
  for (const port of ["0", "65536", "10.5", "http", "-1"]) {
    assert.throws(() => resolveNodeConfiguration({ PORT: port }), /PORT/);
  }
  assert.throws(() => resolveNodeConfiguration({ PEER_HOURS_BOOTSTRAP_KEY: "not-a-core-key" }), /PEER_HOURS_BOOTSTRAP_KEY/);
  assert.throws(() => resolveNodeConfiguration({ ENABLE_DEV_PEER_REGISTRATION: "yes" }), /ENABLE_DEV_PEER_REGISTRATION/);
});
