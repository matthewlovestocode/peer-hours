import {
  createEd25519MemberSignatureVerifier,
  type MemberSigningKeyAuthorization,
} from "@peer-hours/timebank-identity";
import {
  canonicalRecordEnvelope,
  createRecordEnvelope,
  type JsonValue,
  type RecordEnvelope,
} from "./envelope.js";

/** The domain-separation marker for signatures over complete immutable record envelopes. */
export const MEMBER_SIGNED_RECORD_SCHEMA = "peer-hours/member-signed-record/v1";

/** An immutable record envelope accompanied by its author's authorized Ed25519 signature. */
export interface MemberSignedRecord<Payload extends JsonValue = JsonValue> extends RecordEnvelope<Payload> {
  readonly signingKeyId: string;
  readonly signature: string;
}

/** Input used to create and structurally validate a member-signed immutable record. */
export type CreateMemberSignedRecordInput<Payload extends JsonValue = JsonValue> = MemberSignedRecord<Payload>;

/** Raised when a member-signed record is structurally incomplete. */
export class MemberSignedRecordError extends Error {
  /** Creates a member-signed-record error with a readable explanation. */
  constructor(message: string) {
    super(message);
    this.name = "MemberSignedRecordError";
  }
}

/**
 * Creates an immutable member-signed record without treating possession as authorization.
 *
 * Callers sign `canonicalMemberSignedRecordPayload` first. Authorization is intentionally
 * checked during admission against the replicated identity state, not while constructing data.
 */
export function createMemberSignedRecord<Payload extends JsonValue>(
  input: CreateMemberSignedRecordInput<Payload>,
): MemberSignedRecord<Payload> {
  const record = createRecordEnvelope(input);
  assertText(input.signingKeyId, "Member signing key id");
  assertText(input.signature, "Member record signature");

  return Object.freeze({
    ...record,
    signingKeyId: input.signingKeyId,
    signature: input.signature,
  });
}

/** Returns the exact domain-separated bytes an author signs for one immutable record envelope. */
export function canonicalMemberSignedRecordPayload(record: RecordEnvelope): Buffer {
  return Buffer.from(JSON.stringify({
    schema: MEMBER_SIGNED_RECORD_SCHEMA,
    record: JSON.parse(canonicalRecordEnvelope(record)),
  }), "utf8");
}

/**
 * Verifies that an active community authorization for the envelope author signed every record term.
 *
 * A false result is an admission failure: callers must not reduce the record into domain state.
 */
export function verifyMemberSignedRecord(
  record: MemberSignedRecord,
  authorizations: readonly MemberSigningKeyAuthorization[],
): boolean {
  let normalized: MemberSignedRecord;
  try {
    normalized = createMemberSignedRecord(record);
  } catch {
    return false;
  }

  return createEd25519MemberSignatureVerifier(authorizations)({
    communityId: normalized.communityId,
    memberId: normalized.authorId,
    keyId: normalized.signingKeyId,
    payload: canonicalMemberSignedRecordPayload(normalized),
    signature: normalized.signature,
  });
}

/** Narrows a record-shaped value to the additional immutable fields needed for member admission. */
export function isMemberSignedRecord(value: RecordEnvelope): value is MemberSignedRecord {
  return "signingKeyId" in value && "signature" in value;
}

/** Ensures a signature metadata term is non-blank text. */
function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MemberSignedRecordError(`${label} is required.`);
  }
}
