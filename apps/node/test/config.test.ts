import assert from "node:assert/strict";
import test from "node:test";
import { resolveNodeConfiguration } from "../src/config.js";

test("resolves a development data directory relative to the supplied working directory", () => {
  assert.deepEqual(resolveNodeConfiguration({}, "/srv/peer-hours"), {
    port: 10_000,
    dataDirectory: "/srv/peer-hours/data",
  });
});

test("resolves an explicit data directory and valid port", () => {
  assert.deepEqual(resolveNodeConfiguration({ DATA_DIR: "/var/lib/peer-hours", PORT: "8080" }, "/srv/peer-hours"), {
    port: 8080,
    dataDirectory: "/var/lib/peer-hours",
  });
});

test("rejects blank data directories and invalid TCP ports before startup", () => {
  assert.throws(() => resolveNodeConfiguration({ DATA_DIR: "   " }), /DATA_DIR/);
  for (const port of ["0", "65536", "10.5", "http", "-1"]) {
    assert.throws(() => resolveNodeConfiguration({ PORT: port }), /PORT/);
  }
});
