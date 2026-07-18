import {
  createRootSignedMemberSigningKeyLifecycle,
  reduceRootSignedMemberSigningKeyLifecycles,
  type MemberSigningKeyAuthorization,
  type RootSignedMemberSigningKeyLifecycle,
} from "@peer-hours/timebank-identity";
import { createRecordEnvelope, type JsonObject, type RecordEnvelope } from "./envelope.js";
import { memberFeedDeclarationFromRecord, MEMBER_FEED_DECLARATION_RECORD_KIND } from "./self-owned-identity-records.js";

/** Record kind for a root-signed member signing-key activation statement. */
export const ROOT_SIGNED_KEY_ACTIVATION_RECORD_KIND = "identity.root-signed-member-key.activate";

/** Record kind for a root-signed member signing-key revocation statement. */
export const ROOT_SIGNED_KEY_REVOCATION_RECORD_KIND = "identity.root-signed-member-key.revoke";

/** The root-signed lifecycle record kinds understood by the self-owned identity resolver. */
export type RootSignedKeyLifecycleRecordKind =
  | typeof ROOT_SIGNED_KEY_ACTIVATION_RECORD_KIND
  | typeof ROOT_SIGNED_KEY_REVOCATION_RECORD_KIND;

/** A replicated envelope containing one root-signed member key lifecycle statement. */
export type RootSignedMemberSigningKeyLifecycleRecord = RecordEnvelope<JsonObject & RootSignedMemberSigningKeyLifecycle>;

/** Raised when a root-signed member key lifecycle envelope is inconsistent or unproven. */
export class RootSignedKeyLifecycleRecordError extends Error {
  /** Creates a readable root-signed lifecycle record error. */
  constructor(message: string) {
    super(message);
    this.name = "RootSignedKeyLifecycleRecordError";
  }
}

/** Maps one validated root-signed lifecycle statement into a replica-safe immutable envelope. */
export function rootSignedMemberSigningKeyLifecycleToRecord(
  statement: RootSignedMemberSigningKeyLifecycle,
): RootSignedMemberSigningKeyLifecycleRecord {
  const normalized = createRootSignedMemberSigningKeyLifecycle(statement);
  return createRecordEnvelope({
    id: normalized.eventId,
    schema: "peer-hours/timebank-record",
    version: 1,
    kind: recordKindFor(normalized),
    communityId: normalized.communityId,
    occurredAt: normalized.occurredAt,
    authorId: normalized.memberId,
    payload: normalized as JsonObject & RootSignedMemberSigningKeyLifecycle,
  });
}

/** Restores a root-signed lifecycle statement only when all envelope routing terms match it. */
export function rootSignedMemberSigningKeyLifecycleFromRecord(
  record: RecordEnvelope,
): RootSignedMemberSigningKeyLifecycle {
  const normalizedRecord = createRecordEnvelope(record);
  let statement: RootSignedMemberSigningKeyLifecycle;
  try {
    statement = createRootSignedMemberSigningKeyLifecycle(normalizedRecord.payload as unknown as RootSignedMemberSigningKeyLifecycle);
  } catch (error) {
    throw new RootSignedKeyLifecycleRecordError(error instanceof Error ? error.message : "Root-signed key lifecycle payload is invalid.");
  }
  if (
    normalizedRecord.schema !== "peer-hours/timebank-record" ||
    normalizedRecord.version !== 1 ||
    normalizedRecord.kind !== recordKindFor(statement) ||
    normalizedRecord.id !== statement.eventId ||
    normalizedRecord.communityId !== statement.communityId ||
    normalizedRecord.authorId !== statement.memberId ||
    normalizedRecord.occurredAt !== statement.occurredAt
  ) {
    throw new RootSignedKeyLifecycleRecordError("A root-signed key lifecycle envelope must match its signed statement.");
  }
  return statement;
}

/**
 * Reduces self-owned key lifecycle records only when the matching root has published feed provenance.
 *
 * This binds recovery actions to a real member-owned record feed. A root signature proves ownership,
 * while the declaration proves that the root has entered this replicated member-record topology.
 */
export function reduceProvenRootSignedMemberSigningKeyLifecycleRecords(input: {
  readonly lifecycleRecords: readonly RecordEnvelope[];
  readonly memberFeedDeclarationRecords: readonly RecordEnvelope[];
}): readonly MemberSigningKeyAuthorization[] {
  const declaredRoots = new Set<string>();
  for (const record of input.memberFeedDeclarationRecords) {
    if (record.kind !== MEMBER_FEED_DECLARATION_RECORD_KIND) continue;
    const declaration = memberFeedDeclarationFromRecord(record);
    declaredRoots.add(rootKey(declaration.communityId, declaration.memberId, declaration.rootPublicKeyPem));
  }
  const statements = input.lifecycleRecords.map(rootSignedMemberSigningKeyLifecycleFromRecord);
  for (const statement of statements) {
    if (!declaredRoots.has(rootKey(statement.communityId, statement.memberId, statement.rootPublicKeyPem))) {
      throw new RootSignedKeyLifecycleRecordError("A root-signed key lifecycle statement requires matching member feed provenance.");
    }
  }
  return reduceRootSignedMemberSigningKeyLifecycles(statements);
}

/** Narrows records that carry the current root-signed member key lifecycle protocol. */
export function isRootSignedMemberSigningKeyLifecycleRecord(record: RecordEnvelope): boolean {
  return record.kind === ROOT_SIGNED_KEY_ACTIVATION_RECORD_KIND || record.kind === ROOT_SIGNED_KEY_REVOCATION_RECORD_KIND;
}

/** Returns the only envelope kind allowed for one root-signed lifecycle action. */
function recordKindFor(statement: RootSignedMemberSigningKeyLifecycle): RootSignedKeyLifecycleRecordKind {
  return statement.action === "activate" ? ROOT_SIGNED_KEY_ACTIVATION_RECORD_KIND : ROOT_SIGNED_KEY_REVOCATION_RECORD_KIND;
}

/** Creates a collision-safe declaration binding index key. */
function rootKey(communityId: string, memberId: string, rootPublicKeyPem: string): string {
  return `${communityId}\u0000${memberId}\u0000${rootPublicKeyPem}`;
}
