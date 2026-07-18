import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";
import { createTransfer, type SignatureVerifier, type Transfer, type VerifyAttestationInput } from "@peer-hours/timebank-ledger";

/** A stable identifier for an authorized member signing key within one community. */
export type SigningKeyId = string;

/** A community-scoped authorization for one member's Ed25519 public signing key. */
export interface MemberSigningKeyAuthorization {
  readonly communityId: string;
  readonly memberId: string;
  readonly keyId: SigningKeyId;
  readonly publicKeyPem: string;
  readonly active: boolean;
}

/** Input used to create an immutable community-scoped signing-key authorization. */
export interface CreateMemberSigningKeyAuthorizationInput extends MemberSigningKeyAuthorization {}

/** The immutable lifecycle action applied to one community member signing key. */
export type MemberSigningKeyAuthorizationAction = "activate" | "revoke";

/** Immutable replicated event that authorizes a member's Ed25519 public signing key. */
export interface MemberSigningKeyActivationEvent {
  readonly eventId: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly keyId: SigningKeyId;
  readonly action: "activate";
  readonly occurredAt: string;
  readonly publicKeyPem: string;
}

/** Immutable replicated event that revokes one member's currently known signing key. */
export interface MemberSigningKeyRevocationEvent {
  readonly eventId: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly keyId: SigningKeyId;
  readonly action: "revoke";
  readonly occurredAt: string;
}

/** A replicated member signing-key authorization lifecycle event. */
export type MemberSigningKeyAuthorizationEvent = MemberSigningKeyActivationEvent | MemberSigningKeyRevocationEvent;

/** Input used to create one immutable member signing-key authorization lifecycle event. */
export type CreateMemberSigningKeyAuthorizationEventInput = MemberSigningKeyAuthorizationEvent;

/** Error raised when a member signing-key authorization is structurally invalid. */
export class IdentityRuleError extends Error {
  /** Creates an identity-rule error with a readable explanation. */
  constructor(message: string) {
    super(message);
    this.name = "IdentityRuleError";
  }
}

/** Immutable inputs used to verify one authorized member's detached Ed25519 signature. */
export interface VerifyMemberSignatureInput {
  readonly communityId: string;
  readonly memberId: string;
  readonly keyId: SigningKeyId;
  readonly payload: Uint8Array;
  readonly signature: string;
}

/** Verifies a detached payload signature using a snapshot of active member authorizations. */
export type MemberSignatureVerifier = (input: VerifyMemberSignatureInput) => boolean;

/** A self-certifying public member identity derived from its root Ed25519 public key. */
export interface SelfOwnedMemberIdentity {
  readonly memberId: string;
  readonly rootPublicKeyPem: string;
}

/** Input needed to validate a public, self-certifying member identity. */
export interface CreateSelfOwnedMemberIdentityInput {
  readonly rootPublicKeyPem: string;
}

/** A signed statement that one self-owned identity publishes records through one Hypercore feed. */
export interface MemberFeedDeclaration {
  readonly schema: "peer-hours/member-feed-declaration/v1";
  readonly memberId: string;
  readonly communityId: string;
  readonly feedPublicKey: string;
  readonly occurredAt: string;
  readonly rootPublicKeyPem: string;
  readonly signature: string;
}

/** Input used to validate a signed, community-scoped member-feed declaration. */
export type CreateMemberFeedDeclarationInput = MemberFeedDeclaration;

/** A short-lived root-signed announcement that makes one declared member feed discoverable to peers. */
export interface MemberFeedAnnouncement {
  readonly schema: "peer-hours/member-feed-announcement/v1";
  readonly declaration: MemberFeedDeclaration;
  readonly announcedAt: string;
  readonly expiresAt: string;
  readonly signature: string;
}

/** Input used to validate one short-lived member-feed announcement. */
export type CreateMemberFeedAnnouncementInput = MemberFeedAnnouncement;

/** Derives a stable member identifier from the exact Ed25519 root public key that owns it. */
export function createSelfOwnedMemberIdentity(input: CreateSelfOwnedMemberIdentityInput): SelfOwnedMemberIdentity {
  assertPresent(input.rootPublicKeyPem, "Root public key");
  const rootPublicKey = parseEd25519PublicKey(input.rootPublicKeyPem);
  const memberId = `phm_${createHash("sha256").update(rootPublicKey.export({ format: "der", type: "spki" })).digest("base64url")}`;
  return Object.freeze({ memberId, rootPublicKeyPem: input.rootPublicKeyPem });
}

/** Returns the exact domain-separated bytes a root identity signs to declare one member feed. */
export function canonicalMemberFeedDeclarationPayload(declaration: Omit<MemberFeedDeclaration, "signature">): Buffer {
  const identity = createSelfOwnedMemberIdentity({ rootPublicKeyPem: declaration.rootPublicKeyPem });
  assertPresent(declaration.communityId, "Community id");
  assertCanonicalHypercoreKey(declaration.feedPublicKey);
  assertCanonicalTimestamp(declaration.occurredAt);
  if (declaration.memberId !== identity.memberId) {
    throw new IdentityRuleError("A member feed declaration member id must match its root public key.");
  }

  return Buffer.from(JSON.stringify({
    schema: "peer-hours/member-feed-declaration/v1",
    memberId: identity.memberId,
    communityId: declaration.communityId,
    feedPublicKey: declaration.feedPublicKey,
    occurredAt: declaration.occurredAt,
    rootPublicKeyPem: identity.rootPublicKeyPem,
  }), "utf8");
}

/** Creates a declaration only when its self-owned root identity signed the exact feed terms. */
export function createMemberFeedDeclaration(input: CreateMemberFeedDeclarationInput): MemberFeedDeclaration {
  if (input.schema !== "peer-hours/member-feed-declaration/v1") {
    throw new IdentityRuleError("A member feed declaration must use the current schema.");
  }
  const payload = canonicalMemberFeedDeclarationPayload(input);
  const signature = decodeBase64UrlSignature(input.signature);
  if (signature === undefined || !verify(null, payload, parseEd25519PublicKey(input.rootPublicKeyPem), signature)) {
    throw new IdentityRuleError("A member feed declaration must have a valid root identity signature.");
  }

  return Object.freeze({ ...input });
}

/** Returns the exact domain-separated bytes a root identity signs to announce one declared feed. */
export function canonicalMemberFeedAnnouncementPayload(announcement: Omit<MemberFeedAnnouncement, "signature">): Buffer {
  const declaration = createMemberFeedDeclaration(announcement.declaration);
  assertCanonicalTimestamp(announcement.announcedAt);
  assertCanonicalTimestamp(announcement.expiresAt);
  if (Date.parse(announcement.expiresAt) <= Date.parse(announcement.announcedAt)) {
    throw new IdentityRuleError("A member feed announcement must expire after it is announced.");
  }

  return Buffer.from(JSON.stringify({
    schema: "peer-hours/member-feed-announcement/v1",
    declaration,
    announcedAt: announcement.announcedAt,
    expiresAt: announcement.expiresAt,
  }), "utf8");
}

/** Creates a discoverable feed announcement only when its owning root identity signed its exact terms. */
export function createMemberFeedAnnouncement(input: CreateMemberFeedAnnouncementInput): MemberFeedAnnouncement {
  if (input.schema !== "peer-hours/member-feed-announcement/v1") {
    throw new IdentityRuleError("A member feed announcement must use the current schema.");
  }
  const declaration = createMemberFeedDeclaration(input.declaration);
  const payload = canonicalMemberFeedAnnouncementPayload({ ...input, declaration });
  const signature = decodeBase64UrlSignature(input.signature);
  if (signature === undefined || !verify(null, payload, parseEd25519PublicKey(declaration.rootPublicKeyPem), signature)) {
    throw new IdentityRuleError("A member feed announcement must have a valid root identity signature.");
  }

  return Object.freeze({
    schema: input.schema,
    declaration,
    announcedAt: input.announcedAt,
    expiresAt: input.expiresAt,
    signature: input.signature,
  });
}

/**
 * Creates an immutable authorization for one member's Ed25519 public key.
 *
 * Authorizations are scoped to exactly one community and are intentionally separate from
 * the ledger: callers replicate or otherwise manage these records before creating a verifier.
 */
export function createMemberSigningKeyAuthorization(
  input: CreateMemberSigningKeyAuthorizationInput,
): MemberSigningKeyAuthorization {
  assertPresent(input.communityId, "Community id");
  assertPresent(input.memberId, "Member id");
  assertPresent(input.keyId, "Signing key id");
  assertPresent(input.publicKeyPem, "Ed25519 public key");
  parseEd25519PublicKey(input.publicKeyPem);

  return Object.freeze({
    communityId: input.communityId,
    memberId: input.memberId,
    keyId: input.keyId,
    publicKeyPem: input.publicKeyPem,
    active: input.active,
  });
}

/**
 * Creates an immutable authorization lifecycle event suitable for replication.
 *
 * Event ids make repeated delivery idempotent. Activations name the authorized Ed25519 public
 * key, while revocations target a previously known community, member, and key id.
 */
export function createMemberSigningKeyAuthorizationEvent(
  input: CreateMemberSigningKeyAuthorizationEventInput,
): MemberSigningKeyAuthorizationEvent {
  assertPresent(input.eventId, "Authorization event id");
  assertPresent(input.communityId, "Community id");
  assertPresent(input.memberId, "Member id");
  assertPresent(input.keyId, "Signing key id");
  assertCanonicalTimestamp(input.occurredAt);

  if (input.action === "activate") {
    assertPresent(input.publicKeyPem, "Ed25519 public key");
    parseEd25519PublicKey(input.publicKeyPem);
    return Object.freeze({
      eventId: input.eventId,
      communityId: input.communityId,
      memberId: input.memberId,
      keyId: input.keyId,
      action: input.action,
      occurredAt: input.occurredAt,
      publicKeyPem: input.publicKeyPem,
    });
  }

  if (input.action !== "revoke") {
    throw new IdentityRuleError("Authorization event action must be activate or revoke.");
  }

  return Object.freeze({
    eventId: input.eventId,
    communityId: input.communityId,
    memberId: input.memberId,
    keyId: input.keyId,
    action: input.action,
    occurredAt: input.occurredAt,
  });
}

/**
 * Deterministically reduces an unordered replicated event history to current key authorizations.
 *
 * Identical event ids are delivered once. A duplicate id carrying different immutable terms is
 * rejected so replicas cannot silently choose between conflicting histories.
 */
export function reduceMemberSigningKeyAuthorizationEvents(
  events: readonly MemberSigningKeyAuthorizationEvent[],
): readonly MemberSigningKeyAuthorization[] {
  const eventsById = new Map<string, MemberSigningKeyAuthorizationEvent>();

  for (const event of events) {
    const normalized = createMemberSigningKeyAuthorizationEvent(event);
    const existing = eventsById.get(normalized.eventId);
    if (existing !== undefined && authorizationEventFingerprint(existing) !== authorizationEventFingerprint(normalized)) {
      throw new IdentityRuleError("Conflicting authorization events share the same event id.");
    }
    eventsById.set(normalized.eventId, normalized);
  }

  // A member's key id is a durable public identifier. Permitting later activation events to
  // silently replace its public material would let an unordered history reinterpret signatures
  // that were already observed under that member and key id.
  const activationTermsByKeyId = new Map<string, string>();
  for (const event of eventsById.values()) {
    if (event.action !== "activate") continue;
    const keyId = keyFor(event.communityId, event.memberId, event.keyId);
    const terms = signingKeyFingerprint(event.publicKeyPem);
    const existing = activationTermsByKeyId.get(keyId);
    if (existing !== undefined && existing !== terms) {
      throw new IdentityRuleError("A member signing key id cannot be reassigned to different public key material.");
    }
    activationTermsByKeyId.set(keyId, terms);
  }

  const currentByKey = new Map<string, ReducedAuthorization>();
  const orderedEvents = [...eventsById.values()].sort(compareAuthorizationEvents);
  for (const event of orderedEvents) {
    const authorizationKey = keyFor(event.communityId, event.memberId, event.keyId);
    const current = currentByKey.get(authorizationKey);

    if (event.action === "activate") {
      currentByKey.set(authorizationKey, {
        authorization: createMemberSigningKeyAuthorization({ ...event, active: true }),
        occurredAt: event.occurredAt,
        eventId: event.eventId,
      });
      continue;
    }

    if (current !== undefined) {
      currentByKey.set(authorizationKey, {
        authorization: createMemberSigningKeyAuthorization({ ...current.authorization, active: false }),
        occurredAt: event.occurredAt,
        eventId: event.eventId,
      });
    }
  }

  return Object.freeze(
    [...currentByKey.values()]
      .sort(compareReducedAuthorizations)
      .map(({ authorization }) => authorization),
  );
}

/**
 * Encodes the immutable transfer terms that Ed25519 participants sign.
 *
 * Attestations are deliberately excluded so both parties sign precisely the same bytes.
 * The explicit field order and null markers make the payload stable across equivalent transfer
 * objects and distinguish omitted optional terms from all other values.
 */
export function canonicalTransferPayload(transfer: Transfer): Buffer {
  const normalized = createTransfer(transfer);
  const canonicalTerms = {
    schema: "peer-hours/ledger-transfer/v1",
    id: normalized.id,
    communityId: normalized.communityId,
    sourceProposalId: normalized.sourceProposalId ?? null,
    providerMemberId: normalized.providerMemberId,
    recipientMemberId: normalized.recipientMemberId,
    minutes: normalized.minutes,
    reversesTransferId: normalized.reversesTransferId ?? null,
  };

  return Buffer.from(JSON.stringify(canonicalTerms), "utf8");
}

/** Returns the canonical base64url SHA-256 digest of the exact bytes participants sign. */
export function transferPayloadDigest(transfer: Transfer): string {
  return createHash("sha256").update(canonicalTransferPayload(transfer)).digest("base64url");
}

/**
 * Creates a ledger-compatible verifier that accepts only active Ed25519 keys authorized for
 * the attesting member in the transfer's own community.
 *
 * The registry is parsed and snapshotted when this function is called. A member may hold
 * multiple active keys during key rotation, but each attestation must name the exact key used.
 */
export function createEd25519SignatureVerifier(
  authorizations: readonly MemberSigningKeyAuthorization[],
): SignatureVerifier {
  const verifyMemberSignature = createEd25519MemberSignatureVerifier(authorizations);

  return (input: VerifyAttestationInput): boolean => {
    if (input.attestation.payloadDigest !== transferPayloadDigest(input.transfer)) {
      return false;
    }
    return verifyMemberSignature({
      communityId: input.transfer.communityId,
      memberId: input.attestation.memberId,
      keyId: input.attestation.keyId,
      payload: canonicalTransferPayload(input.transfer),
      signature: input.attestation.signature,
    });
  };
}

/**
 * Admits a transfer only when both canonical participant attestations verify against active,
 * community-scoped Ed25519 authorizations.
 *
 * This is a cryptographic admission check, not a ledger or replication-finality decision. The
 * returned transfer is structurally normalized; callers still apply their own settlement and
 * ledger policies before deriving balances.
 */
export function assertAuthorizedTransferAttestations(
  transfer: Transfer,
  authorizations: readonly MemberSigningKeyAuthorization[],
): Transfer {
  const normalized = createTransfer(transfer);
  const verifyAttestation = createEd25519SignatureVerifier(authorizations);

  for (const attestation of normalized.attestations) {
    let verified = false;
    try {
      verified = verifyAttestation({ transfer: normalized, attestation });
    } catch {
      // Treat malformed authorization or signature input as failed admission.
    }
    if (!verified) {
      throw new IdentityRuleError("Each participant must provide a valid authorized Ed25519 transfer attestation.");
    }
  }

  return normalized;
}

/**
 * Creates a verifier for arbitrary immutable member-authored payloads.
 *
 * This is intentionally separate from transfer attestation verification so record adapters can
 * authenticate their own canonical payload without inheriting ledger-specific terms.
 */
export function createEd25519MemberSignatureVerifier(
  authorizations: readonly MemberSigningKeyAuthorization[],
): MemberSignatureVerifier {
  const keysByCommunityMemberAndId = indexAuthorizedKeys(authorizations);

  return (input: VerifyMemberSignatureInput): boolean => {
    const key = keysByCommunityMemberAndId.get(keyFor(input.communityId, input.memberId, input.keyId));
    const signature = decodeBase64UrlSignature(input.signature);
    if (key === undefined || signature === undefined) {
      return false;
    }

    try {
      return verify(null, input.payload, key, signature);
    } catch {
      return false;
    }
  };
}

/** Indexes only active, uniquely identified keys by their community and authorized member. */
function indexAuthorizedKeys(authorizations: readonly MemberSigningKeyAuthorization[]): ReadonlyMap<string, KeyObject> {
  const keysByCommunityMemberAndId = new Map<string, KeyObject>();
  const authorizationIds = new Set<string>();
  const keyOwners = new Map<string, string>();

  for (const authorization of authorizations) {
    const normalized = createMemberSigningKeyAuthorization(authorization);
    const authorizationId = `${normalized.communityId}\u0000${normalized.keyId}`;
    if (authorizationIds.has(authorizationId)) {
      throw new IdentityRuleError("A community signing key id may be authorized only once.");
    }
    authorizationIds.add(authorizationId);

    const publicKey = parseEd25519PublicKey(normalized.publicKeyPem);
    const publicKeyFingerprint = signingKeyFingerprint(normalized.publicKeyPem);
    const keyOwner = `${normalized.communityId}\u0000${normalized.memberId}`;
    const existingOwner = keyOwners.get(publicKeyFingerprint);
    if (existingOwner !== undefined && existingOwner !== keyOwner) {
      throw new IdentityRuleError("A community signing key cannot be authorized for multiple members.");
    }
    keyOwners.set(publicKeyFingerprint, keyOwner);

    if (!normalized.active) {
      continue;
    }

    keysByCommunityMemberAndId.set(keyFor(normalized.communityId, normalized.memberId, normalized.keyId), publicKey);
  }

  return keysByCommunityMemberAndId;
}

/** Returns the stable public-key fingerprint used to reject authorization-key reassignment. */
function signingKeyFingerprint(publicKeyPem: string): string {
  return parseEd25519PublicKey(publicKeyPem).export({ format: "der", type: "spki" }).toString("base64url");
}

/** One current authorization paired with the event that most recently determined its state. */
interface ReducedAuthorization {
  readonly authorization: MemberSigningKeyAuthorization;
  readonly occurredAt: string;
  readonly eventId: string;
}

/** Sorts lifecycle events into a replica-independent chronological order. */
function compareAuthorizationEvents(
  left: MemberSigningKeyAuthorizationEvent,
  right: MemberSigningKeyAuthorizationEvent,
): number {
  return left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId);
}

/** Sorts current authorizations by their determining event, then immutable authorization scope. */
function compareReducedAuthorizations(left: ReducedAuthorization, right: ReducedAuthorization): number {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.eventId.localeCompare(right.eventId) ||
    left.authorization.communityId.localeCompare(right.authorization.communityId) ||
    left.authorization.memberId.localeCompare(right.authorization.memberId) ||
    left.authorization.keyId.localeCompare(right.authorization.keyId)
  );
}

/** Produces stable immutable terms for detecting conflicting duplicate event ids. */
function authorizationEventFingerprint(event: MemberSigningKeyAuthorizationEvent): string {
  return JSON.stringify({
    eventId: event.eventId,
    communityId: event.communityId,
    memberId: event.memberId,
    keyId: event.keyId,
    action: event.action,
    occurredAt: event.occurredAt,
    publicKeyPem: event.action === "activate" ? event.publicKeyPem : null,
  });
}

/** Parses an Ed25519 PEM public key and rejects other key algorithms. */
function parseEd25519PublicKey(publicKeyPem: string): KeyObject {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") {
      throw new IdentityRuleError("A member signing key must use Ed25519.");
    }
    return publicKey;
  } catch (error) {
    if (error instanceof IdentityRuleError) {
      throw error;
    }
    throw new IdentityRuleError("A member signing key must contain a valid Ed25519 public key.");
  }
}

/** Decodes only canonical base64url-encoded Ed25519 signature text. */
function decodeBase64UrlSignature(signature: string): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) {
    return undefined;
  }

  const decoded = Buffer.from(signature, "base64url");
  if (decoded.length !== 64 || decoded.toString("base64url") !== signature) {
    return undefined;
  }
  return decoded;
}

/** Creates a collision-safe index key from one community and member identifier. */
function keyFor(communityId: string, memberId: string, keyId: string): string {
  return `${communityId}\u0000${memberId}\u0000${keyId}`;
}

/** Ensures authorization text values are non-blank. */
function assertPresent(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IdentityRuleError(`${label} is required.`);
  }
}

/** Ensures a lifecycle event timestamp has one unambiguous UTC ISO-8601 representation. */
function assertCanonicalTimestamp(value: string): void {
  assertPresent(value, "Authorization event timestamp");
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== value) {
    throw new IdentityRuleError("Authorization event timestamp must be a canonical UTC ISO-8601 timestamp.");
  }
}

/** Validates a canonical hexadecimal Hypercore public key used to address a member feed. */
function assertCanonicalHypercoreKey(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new IdentityRuleError("A member feed public key must be a lowercase 64-character hexadecimal Hypercore key.");
  }
}
