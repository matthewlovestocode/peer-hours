import assert from "node:assert/strict";
import test from "node:test";
import { createHealthPayload } from "../src/health.js";

test("creates a health payload from node state", () => {
  const payload = createHealthPayload({
    state: "ok",
    core: "000fff",
    length: 3,
  });

  assert.deepEqual(payload, {
    status: "ok",
    core: "000fff",
    length: 3,
  });
});

test("preserves a non-ready runtime state without claiming success", () => {
  assert.deepEqual(createHealthPayload({ state: "starting", core: "", length: 0 }), {
    status: "starting",
    core: "",
    length: 0,
  });
});
