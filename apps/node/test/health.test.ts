import assert from "node:assert/strict";
import test from "node:test";
import { createHealthPayload } from "../src/health.js";

test("creates a health payload from node state", () => {
  const payload = createHealthPayload({
    key: Buffer.from([0, 15, 255]),
    length: 3,
  });

  assert.deepEqual(payload, {
    status: "ok",
    core: "000fff",
    length: 3,
  });
});
