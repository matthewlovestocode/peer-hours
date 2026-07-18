import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadOrCreateReceiptIdentity } from "../src/receipt-identity.js";

test("persists and reloads one non-exported community-node receipt identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-receipt-identity-"));
  const path = join(directory, "nested", "receipt.pem");
  try {
    const first = await loadOrCreateReceiptIdentity(path);
    const second = await loadOrCreateReceiptIdentity(path);
    assert.equal(second.nodeId, first.nodeId);
    assert.equal(second.publicKey, first.publicKey);
    assert.match(await readFile(path, "utf8"), /PRIVATE KEY/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
