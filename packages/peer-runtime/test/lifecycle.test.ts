import assert from "node:assert/strict";
import test from "node:test";
import { derivePeerLifecycleState, type PeerStatus } from "../src/index.js";
import { PeerRuntime } from "../src/index.js";

const now = Date.parse("2026-07-18T00:00:30.000Z");

/** Creates a minimal peer status fixture at a predictable point in time. */
function peerAt(ageMs: number, lifecycleState: PeerStatus["lifecycleState"] = "connected"): PeerStatus {
  return {
    id: "peer-a",
    connectedAt: new Date(now - ageMs).toISOString(),
    lastSeenAt: new Date(now - ageMs).toISOString(),
    lifecycleState,
  };
}

test("keeps a recently seen peer connected", () => {
  assert.equal(derivePeerLifecycleState(peerAt(5_000), now), "connected");
});

test("marks a quiet connected peer stale", () => {
  assert.equal(derivePeerLifecycleState(peerAt(10_001), now), "stale");
});

test("marks a peer offline after the retention window", () => {
  assert.equal(derivePeerLifecycleState(peerAt(30_001), now), "offline");
});

test("preserves connecting and discovered states while they are fresh", () => {
  assert.equal(derivePeerLifecycleState(peerAt(1_000, "connecting"), now), "connecting");
  assert.equal(derivePeerLifecycleState(peerAt(1_000, "discovered"), now), "discovered");
});

test("restores a stale simulated peer when its heartbeat resumes", () => {
  let clock = now;
  const runtime = new PeerRuntime("/tmp/peer-hours-lifecycle-test", undefined, undefined, () => clock);

  runtime.registerSimulatedPeer("simulated-peer-a");
  const firstConnection = runtime.status().peers[0].connectedAt;

  clock += 10_001;
  assert.equal(runtime.status().peers[0].lifecycleState, "stale");

  clock += 1;
  runtime.registerSimulatedPeer("simulated-peer-a");
  const resumed = runtime.status().peers[0];
  assert.equal(resumed.lifecycleState, "connected");
  assert.equal(resumed.connectedAt, firstConnection);
});
