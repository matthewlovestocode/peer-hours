import {
  createMemberFeedDeclaration,
  type MemberFeedDeclaration,
  type MemberSigningKeyAuthorization,
} from "@peer-hours/timebank-identity";
import { createRecordEnvelope, type JsonObject, type RecordEnvelope } from "./envelope.js";

/** Record kind for a root-signed declaration that publishes one member-owned Hypercore feed. */
export const MEMBER_FEED_DECLARATION_RECORD_KIND = "identity.member-feed.declare";

/** Schema used by the existing timebank envelope protocol for self-owned identity declarations. */
export const MEMBER_FEED_DECLARATION_RECORD_SCHEMA = "peer-hours/timebank-record";

/** Envelope version used by the initial self-owned identity declaration adapter. */
export const MEMBER_FEED_DECLARATION_RECORD_VERSION = 1;

/** A replicated envelope preserving every immutable term of a member feed declaration. */
export type MemberFeedDeclarationRecord = RecordEnvelope<JsonObject & MemberFeedDeclaration>;

/** Raises a readable error when a member-feed declaration cannot map safely to an envelope. */
export class MemberFeedDeclarationRecordError extends Error {
  /** Creates a member-feed declaration mapping error. */
  constructor(message: string) {
    super(message);
    this.name = "MemberFeedDeclarationRecordError";
  }
}

/** Maps one valid root-signed feed declaration into a deterministic replicated envelope. */
export function memberFeedDeclarationToRecord(declaration: MemberFeedDeclaration): MemberFeedDeclarationRecord {
  const normalized = createMemberFeedDeclaration(declaration);
  return createRecordEnvelope({
    id: `member-feed:${normalized.memberId}:${normalized.communityId}:${normalized.feedPublicKey}`,
    schema: MEMBER_FEED_DECLARATION_RECORD_SCHEMA,
    version: MEMBER_FEED_DECLARATION_RECORD_VERSION,
    kind: MEMBER_FEED_DECLARATION_RECORD_KIND,
    communityId: normalized.communityId,
    occurredAt: normalized.occurredAt,
    authorId: normalized.memberId,
    payload: normalized as JsonObject & MemberFeedDeclaration,
  });
}

/** Restores a root-signed feed declaration only when its envelope repeats the same immutable identity terms. */
export function memberFeedDeclarationFromRecord(record: RecordEnvelope): MemberFeedDeclaration {
  const normalizedRecord = createRecordEnvelope(record);
  let declaration: MemberFeedDeclaration;
  try {
    declaration = createMemberFeedDeclaration(normalizedRecord.payload as unknown as MemberFeedDeclaration);
  } catch (error) {
    throw new MemberFeedDeclarationRecordError(error instanceof Error ? error.message : "Member feed declaration payload is invalid.");
  }

  if (
    normalizedRecord.schema !== MEMBER_FEED_DECLARATION_RECORD_SCHEMA ||
    normalizedRecord.version !== MEMBER_FEED_DECLARATION_RECORD_VERSION ||
    normalizedRecord.kind !== MEMBER_FEED_DECLARATION_RECORD_KIND ||
    normalizedRecord.authorId !== declaration.memberId ||
    normalizedRecord.communityId !== declaration.communityId ||
    normalizedRecord.occurredAt !== declaration.occurredAt ||
    normalizedRecord.id !== `member-feed:${declaration.memberId}:${declaration.communityId}:${declaration.feedPublicKey}`
  ) {
    throw new MemberFeedDeclarationRecordError("A member-feed declaration envelope must match its signed declaration.");
  }
  return declaration;
}

/** Converts root-signed declarations into the existing verifier shape without a community admission decision. */
export function memberFeedDeclarationsToAuthorizations(
  records: readonly RecordEnvelope[],
): readonly MemberSigningKeyAuthorization[] {
  const byMemberAndFeed = new Map<string, MemberFeedDeclaration>();
  for (const record of records) {
    const declaration = memberFeedDeclarationFromRecord(record);
    const key = `${declaration.communityId}\u0000${declaration.memberId}\u0000${declaration.feedPublicKey}`;
    const existing = byMemberAndFeed.get(key);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(declaration)) {
      throw new MemberFeedDeclarationRecordError("Conflicting member-feed declarations share one identity and feed key.");
    }
    byMemberAndFeed.set(key, declaration);
  }

  return Object.freeze([...byMemberAndFeed.values()]
    .sort((left, right) => left.memberId.localeCompare(right.memberId) || left.feedPublicKey.localeCompare(right.feedPublicKey))
    .map((declaration) => Object.freeze({
      communityId: declaration.communityId,
      memberId: declaration.memberId,
      keyId: rootKeyIdForMember(declaration.memberId),
      publicKeyPem: declaration.rootPublicKeyPem,
      active: true,
    })));
}

/** Returns the unique signing-key label a self-owned root identity uses inside one community verifier. */
export function rootKeyIdForMember(memberId: string): string {
  return `root:${memberId}`;
}
