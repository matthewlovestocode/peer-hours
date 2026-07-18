import {
  createMemberSigningKeyAuthorizationEvent,
  reduceMemberSigningKeyAuthorizationEvents,
  type MemberSigningKeyAuthorization,
  type MemberSigningKeyAuthorizationEvent,
} from "@peer-hours/timebank-identity";
import {
  createRecordEnvelope,
  type JsonObject,
  type RecordEnvelope,
} from "./envelope.js";

/** Record kind for an immutable member signing-key activation lifecycle event. */
export const IDENTITY_KEY_ACTIVATION_RECORD_KIND = "identity.member-signing-key.activate";

/** Record kind for an immutable member signing-key revocation lifecycle event. */
export const IDENTITY_KEY_REVOCATION_RECORD_KIND = "identity.member-signing-key.revoke";

/** The generic envelope schema used by the first replicated Peer Hours timebank records. */
export const IDENTITY_RECORD_SCHEMA = "peer-hours/timebank-record";

/** The current immutable envelope schema version for identity lifecycle records. */
export const IDENTITY_RECORD_VERSION = 1;

/** The identity lifecycle record kinds currently understood by this adapter. */
export type IdentityRecordKind =
  | typeof IDENTITY_KEY_ACTIVATION_RECORD_KIND
  | typeof IDENTITY_KEY_REVOCATION_RECORD_KIND;

/** JSON payload that preserves every immutable member signing-key lifecycle event term. */
export type MemberSigningKeyAuthorizationRecordPayload = JsonObject & MemberSigningKeyAuthorizationEvent;

/** A replicated envelope containing exactly one member signing-key lifecycle event. */
export type MemberSigningKeyAuthorizationRecord = RecordEnvelope<MemberSigningKeyAuthorizationRecordPayload>;

/** Error raised when an identity lifecycle record cannot faithfully represent its event. */
export class IdentityRecordError extends Error {
  /** Creates a readable error for malformed or inconsistent identity records. */
  constructor(message: string) {
    super(message);
    this.name = "IdentityRecordError";
  }
}

/**
 * Maps an immutable member signing-key lifecycle event into its replicated record envelope.
 *
 * This adapter preserves every event term in the payload and repeats its id, community, and
 * timestamp in envelope metadata so replicas can reject accidental cross-community routing.
 * It deliberately does not decide who is permitted to activate or revoke a key: the community
 * authority model remains an explicit protocol gap until authorization events are themselves
 * signed and validated against replicated community policy.
 */
export function memberSigningKeyAuthorizationEventToRecord(
  event: MemberSigningKeyAuthorizationEvent,
): MemberSigningKeyAuthorizationRecord {
  const normalizedEvent = createMemberSigningKeyAuthorizationEvent(event);
  const kind = recordKindFor(normalizedEvent);

  return createRecordEnvelope({
    id: normalizedEvent.eventId,
    schema: IDENTITY_RECORD_SCHEMA,
    version: IDENTITY_RECORD_VERSION,
    kind,
    communityId: normalizedEvent.communityId,
    occurredAt: normalizedEvent.occurredAt,
    // Until community authority is defined, this identifies the event's subject rather than
    // proving that this member was authorized to issue the lifecycle action.
    authorId: normalizedEvent.memberId,
    payload: normalizedEvent as MemberSigningKeyAuthorizationRecordPayload,
  });
}

/**
 * Restores and validates one member signing-key lifecycle event from a replicated record.
 *
 * The envelope and payload must describe the same immutable event and community. This prevents
 * a valid event from being relabeled or routed into another timebank community before it reaches
 * the deterministic identity reducer. Community authority is intentionally not inferred here.
 */
export function memberSigningKeyAuthorizationEventFromRecord(
  record: RecordEnvelope,
): MemberSigningKeyAuthorizationEvent {
  const normalizedRecord = createRecordEnvelope(record);
  const payload = normalizedRecord.payload;

  if (!isAuthorizationEvent(payload)) {
    throw new IdentityRecordError("An identity record payload must be a member signing-key lifecycle event.");
  }

  let event: MemberSigningKeyAuthorizationEvent;
  try {
    event = createMemberSigningKeyAuthorizationEvent(payload);
  } catch (error) {
    throw new IdentityRecordError(error instanceof Error ? error.message : "Identity record payload is invalid.");
  }

  if (
    normalizedRecord.schema !== IDENTITY_RECORD_SCHEMA ||
    normalizedRecord.version !== IDENTITY_RECORD_VERSION ||
    normalizedRecord.kind !== recordKindFor(event)
  ) {
    throw new IdentityRecordError("Identity record kind must match its lifecycle action.");
  }
  if (normalizedRecord.id !== event.eventId) {
    throw new IdentityRecordError("Identity record id must match its lifecycle event id.");
  }
  if (normalizedRecord.authorId !== event.memberId) {
    throw new IdentityRecordError("Identity record author must match its lifecycle event member.");
  }
  if (normalizedRecord.communityId !== event.communityId) {
    throw new IdentityRecordError("Identity record community must match its lifecycle event community.");
  }
  if (normalizedRecord.occurredAt !== event.occurredAt) {
    throw new IdentityRecordError("Identity record timestamp must match its lifecycle event timestamp.");
  }

  return event;
}

/**
 * Reduces replicated identity records into current member signing-key authorizations.
 *
 * Records are normalized before passing their events to the identity package, retaining its
 * idempotent delivery and deterministic unordered-history semantics. This is a mechanical
 * mapping boundary, not a community-authority decision point.
 */
export function reduceMemberSigningKeyAuthorizationRecords(
  records: readonly RecordEnvelope[],
): readonly MemberSigningKeyAuthorization[] {
  return reduceMemberSigningKeyAuthorizationEvents(records.map(memberSigningKeyAuthorizationEventFromRecord));
}

/** Returns the single envelope kind that may represent one identity lifecycle event action. */
function recordKindFor(event: MemberSigningKeyAuthorizationEvent): IdentityRecordKind {
  return event.action === "activate" ? IDENTITY_KEY_ACTIVATION_RECORD_KIND : IDENTITY_KEY_REVOCATION_RECORD_KIND;
}

/** Narrows untrusted record payload data before the identity package applies structural rules. */
function isAuthorizationEvent(value: unknown): value is MemberSigningKeyAuthorizationEvent {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const event = value as { readonly action?: unknown };
  return event.action === "activate" || event.action === "revoke";
}
