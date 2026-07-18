import assert from "node:assert/strict";
import test from "node:test";
import {
  RecordEnvelopeError,
  canonicalRecordEnvelope,
  createRecordEnvelope,
  reduceRecordEnvelopes,
  type RecordEnvelope,
} from "../src/envelope.js";

const communityId = "peer-hours/earth/US/CA/east-bay";

/** Creates a valid generic record envelope for normalization and reduction tests. */
function envelope(overrides: Partial<RecordEnvelope> = {}): RecordEnvelope {
  return createRecordEnvelope({
    id: "record-garden-help",
    schema: "peer-hours/timebank-record",
    version: 1,
    kind: "domain.exchange-proposal",
    communityId,
    occurredAt: "2026-07-18T12:00:00.000Z",
    authorId: "member-provider",
    payload: { proposalId: "proposal-garden-help", minutes: 90, participants: ["member-provider", "member-recipient"] },
    ...overrides,
  });
}

test("normalizes a generic immutable envelope and its JSON payload", () => {
  const record = envelope({
    payload: { zebra: true, details: { minutes: 90, note: null }, alpha: ["member-provider"] },
  });

  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.payload), true);
  assert.equal(Object.isFrozen((record.payload as { readonly alpha: readonly string[] }).alpha), true);
  assert.deepEqual(record.payload, {
    alpha: ["member-provider"],
    details: { minutes: 90, note: null },
    zebra: true,
  });
  assert.throws(() => {
    (record.payload as { alpha: string[] }).alpha.push("member-recipient");
  }, TypeError);
});

test("uses one deterministic canonical representation for equivalent JSON payload object order", () => {
  const first = envelope({ payload: { listingId: "listing-1", details: { title: "Garden help", minutes: 90 } } });
  const second = envelope({ payload: { details: { minutes: 90, title: "Garden help" }, listingId: "listing-1" } });

  assert.equal(canonicalRecordEnvelope(first), canonicalRecordEnvelope(second));
  assert.deepEqual(first, second);
});

test("reduces unordered delivery into deterministic chronological order", () => {
  const later = envelope({ id: "record-later", occurredAt: "2026-07-18T12:01:00.000Z" });
  const firstAtSameTime = envelope({ id: "record-a", occurredAt: "2026-07-18T12:00:00.000Z" });
  const secondAtSameTime = envelope({ id: "record-b", occurredAt: "2026-07-18T12:00:00.000Z" });

  assert.deepEqual(
    reduceRecordEnvelopes([later, secondAtSameTime, firstAtSameTime]).map((record) => record.id),
    ["record-a", "record-b", "record-later"],
  );
});

test("deduplicates identical delivery but rejects conflicting immutable terms for one id", () => {
  const original = envelope();
  const sameTermsDifferentObjectOrder = envelope({ payload: { participants: ["member-provider", "member-recipient"], minutes: 90, proposalId: "proposal-garden-help" } });
  const conflict = envelope({ payload: { proposalId: "proposal-garden-help", minutes: 60, participants: ["member-provider", "member-recipient"] } });

  assert.deepEqual(reduceRecordEnvelopes([original, sameTermsDifferentObjectOrder]), [original]);
  assert.throws(() => reduceRecordEnvelopes([original, conflict]), /conflicting.*id/i);
});

test("rejects malformed envelope terms and non-JSON payload values", () => {
  const invalidInputs: readonly Partial<RecordEnvelope>[] = [
    { id: "" },
    { schema: "" },
    { version: 0 },
    { version: 1.5 },
    { kind: "" },
    { communityId: "" },
    { occurredAt: "2026-07-18T12:00:00Z" },
    { authorId: "" },
    { payload: { missing: undefined } as never },
    { payload: { value: Number.NaN } },
    { payload: new Date() as never },
  ];

  for (const invalid of invalidInputs) {
    assert.throws(() => envelope(invalid), RecordEnvelopeError);
  }
});

test("rejects a __proto__ payload field instead of allowing prototype mutation", () => {
  const payload = JSON.parse('{"__proto__":{"polluted":true}}');

  assert.throws(() => envelope({ payload }), /__proto__/i);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});
