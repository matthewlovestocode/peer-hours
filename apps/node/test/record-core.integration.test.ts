import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PeerRuntime } from "@peer-hours/peer-runtime";
import { createNodeServer } from "../src/server.js";

/** Starts a neutral community peer's HTTP diagnostics around an ephemeral runtime. */
async function startNode(runtime: PeerRuntime): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createNodeServer(runtime, { communityId: "peer-hours/earth/test", displayName: "Test Community" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test node did not bind to a TCP port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("community node publishes only peer-discovery bootstrap metadata, never a community record authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-neutral-peer-"));
  const runtime = new PeerRuntime(directory, undefined, undefined, Date.now, false);
  await runtime.start();
  const node = await startNode(runtime);

  try {
    const bootstrap = await fetch(`${node.baseUrl}/bootstrap`).then((response) => response.json()) as Record<string, unknown>;
    assert.equal(bootstrap.communityId, "peer-hours/earth/test");
    assert.match(String(bootstrap.coreKey), /^[a-f0-9]{64}$/);
    assert.equal(bootstrap.role, "community-peer");
    assert.deepEqual(bootstrap.capabilities, ["discovery", "replication", "diagnostics"]);
    assert.equal("recordCoreKey" in bootstrap, false);
    assert.equal((await fetch(`${node.baseUrl}/records`)).status, 404);
    assert.equal((await fetch(`${node.baseUrl}/records`, { method: "POST" })).status, 404);
  } finally {
    await node.close();
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
