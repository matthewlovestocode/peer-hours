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

test("reports an immutable start time and clock-derived uptime across snapshots", () => {
  let clock = Date.parse("2026-07-18T01:02:03.000Z");
  const runtime = new PeerRuntime("/tmp/peer-hours-runtime-observability-test", undefined, undefined, () => clock, false);

  const initial = runtime.status();
  assert.equal(initial.startedAt, "2026-07-18T01:02:03.000Z");
  assert.equal(initial.uptimeMs, 0);

  clock += 12_345;
  const later = runtime.status();
  const repeated = runtime.status();
  assert.equal(later.startedAt, initial.startedAt);
  assert.equal(later.uptimeMs, 12_345);
  assert.deepEqual(repeated, later);
});

test("never reports negative uptime when an injected clock moves backwards", () => {
  let clock = Date.parse("2026-07-18T01:02:03.000Z");
  const runtime = new PeerRuntime("/tmp/peer-hours-runtime-observability-backward-clock-test", undefined, undefined, () => clock, false);

  clock -= 1;
  assert.equal(runtime.status().uptimeMs, 0);
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

test("returns detached immutable status snapshots", () => {
  const runtime = new PeerRuntime("/tmp/peer-hours-runtime-status-snapshot-test", undefined, undefined, () => now, false);
  runtime.registerSimulatedPeer("simulated-peer-a");

  const snapshot = runtime.status();
  assert.throws(() => { (snapshot.peers[0] as { id: string }).id = "tampered"; }, TypeError);
  assert.throws(() => { (snapshot as { peerId: string }).peerId = "tampered"; }, TypeError);
  assert.equal(runtime.status().peers[0]?.id, "simulated-peer-a");
});

test("isolates failing status listeners from later observers and runtime updates", () => {
  const runtime = new PeerRuntime("/tmp/peer-hours-runtime-listener-test", undefined, undefined, () => now, false);
  const received: string[] = [];
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    runtime.onStatusChange(() => { throw new Error("listener failure"); });
    runtime.onStatusChange((status) => received.push(status.peers[0]?.id ?? "none"));
    runtime.registerSimulatedPeer("simulated-peer-a");
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(received, ["simulated-peer-a"]);
  assert.equal(runtime.status().peers[0]?.id, "simulated-peer-a");
});
