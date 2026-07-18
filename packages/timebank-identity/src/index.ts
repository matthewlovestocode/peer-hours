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

/** Error raised when a member signing-key authorization is structurally invalid. */
export class IdentityRuleError extends Error {
  /** Creates an identity-rule error with a readable explanation. */
  constructor(message: string) {
    super(message);
    this.name = "IdentityRuleError";
  }
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
  const keysByCommunityMemberAndId = indexAuthorizedKeys(authorizations);

  return (input: VerifyAttestationInput): boolean => {
    const key = keysByCommunityMemberAndId.get(keyFor(input.transfer.communityId, input.attestation.memberId, input.attestation.keyId));
    if (key === undefined || input.attestation.payloadDigest !== transferPayloadDigest(input.transfer)) {
      return false;
    }

    const signature = decodeBase64UrlSignature(input.attestation.signature);
    if (signature === undefined) {
      return false;
    }

    try {
      const payload = canonicalTransferPayload(input.transfer);
      return verify(null, payload, key, signature);
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
    const publicKeyFingerprint = publicKey.export({ format: "der", type: "spki" }).toString("base64url");
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
function assertPresent(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new IdentityRuleError(`${label} is required.`);
  }
}
