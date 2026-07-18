/** A JSON primitive that can be stored in an immutable Peer Hours record payload. */
export type JsonPrimitive = null | boolean | number | string;

/** A recursively JSON-compatible value suitable for deterministic replication. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** A recursively JSON-compatible immutable array. */
export type JsonArray = readonly JsonValue[];

/** A recursively JSON-compatible immutable object. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** The immutable, generic record shape replicated between Peer Hours runtimes. */
export interface RecordEnvelope<Payload extends JsonValue = JsonValue> {
  readonly id: string;
  readonly schema: string;
  readonly version: number;
  readonly kind: string;
  readonly communityId: string;
  readonly occurredAt: string;
  readonly authorId: string;
  readonly payload: Payload;
}

/** Input used to normalize one immutable generic Peer Hours record. */
export type RecordEnvelopeInput<Payload extends JsonValue = JsonValue> = RecordEnvelope<Payload>;

/** Error raised when a replicated record is structurally invalid or conflicts by stable id. */
export class RecordEnvelopeError extends Error {
  /** Creates a record-envelope error with a readable explanation. */
  constructor(message: string) {
    super(message);
    this.name = "RecordEnvelopeError";
  }
}

/**
 * Normalizes an immutable, community-scoped record suitable for unordered replicated delivery.
 *
 * Payload terms are recursively copied, key-sorted, and frozen. This makes equivalent JSON
 * objects produce the same canonical form while preventing callers from mutating stored terms.
 */
export function createRecordEnvelope<Payload extends JsonValue>(
  input: RecordEnvelopeInput<Payload>,
): RecordEnvelope<Payload> {
  assertText(input.id, "Record id");
  assertText(input.schema, "Record schema");
  assertPositiveInteger(input.version, "Record version");
  assertText(input.kind, "Record kind");
  assertText(input.communityId, "Community id");
  assertCanonicalTimestamp(input.occurredAt);
  assertText(input.authorId, "Author id");

  return Object.freeze({
    id: input.id,
    schema: input.schema,
    version: input.version,
    kind: input.kind,
    communityId: input.communityId,
    occurredAt: input.occurredAt,
    authorId: input.authorId,
    payload: normalizeJson(input.payload) as Payload,
  });
}

/**
 * Produces stable JSON for comparing one envelope's complete immutable terms.
 *
 * This is a comparison representation, not a signature format; domain-specific signatures may
 * intentionally use a narrower canonical payload.
 */
export function canonicalRecordEnvelope(record: RecordEnvelope): string {
  const normalized = createRecordEnvelope(record);
  return JSON.stringify({
    id: normalized.id,
    schema: normalized.schema,
    version: normalized.version,
    kind: normalized.kind,
    communityId: normalized.communityId,
    occurredAt: normalized.occurredAt,
    authorId: normalized.authorId,
    payload: normalized.payload,
  });
}

/**
 * Deduplicates and orders unordered record delivery for deterministic replica-local processing.
 *
 * Repeated identical records are idempotent. Reusing an id with different immutable terms is a
 * conflict and is rejected rather than allowing replicas to silently select a winner.
 */
export function reduceRecordEnvelopes<Payload extends JsonValue>(
  records: readonly RecordEnvelopeInput<Payload>[],
): readonly RecordEnvelope<Payload>[] {
  const recordsById = new Map<string, RecordEnvelope<Payload>>();

  for (const record of records) {
    const normalized = createRecordEnvelope(record);
    const existing = recordsById.get(normalized.id);
    if (existing !== undefined && canonicalRecordEnvelope(existing) !== canonicalRecordEnvelope(normalized)) {
      throw new RecordEnvelopeError("Conflicting record envelopes share the same record id.");
    }
    recordsById.set(normalized.id, normalized);
  }

  return Object.freeze(
    [...recordsById.values()].sort(
      (left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
    ),
  );
}

/** Recursively validates, copies, key-sorts, and freezes a JSON-compatible payload value. */
function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RecordEnvelopeError("Record payload numbers must be finite JSON numbers.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => normalizeJson(item)));
  }

  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new RecordEnvelopeError("Record payload objects must be plain JSON objects.");
    }

    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new RecordEnvelopeError("Record payload objects cannot contain accessor properties.");
      }
      normalized[key] = normalizeJson(descriptor.value);
    }
    return Object.freeze(normalized);
  }

  throw new RecordEnvelopeError("Record payload must contain only JSON-compatible values.");
}

/** Ensures a stable record field is non-blank text. */
function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RecordEnvelopeError(`${label} is required.`);
  }
}

/** Ensures a schema version is a positive integer. */
function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RecordEnvelopeError(`${label} must be a positive integer.`);
  }
}

/** Ensures event time uses one unambiguous, canonical UTC ISO-8601 representation. */
function assertCanonicalTimestamp(value: unknown): asserts value is string {
  assertText(value, "Record occurredAt timestamp");
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== value) {
    throw new RecordEnvelopeError("Record occurredAt timestamp must be a canonical UTC ISO-8601 timestamp.");
  }
}
