import { createPublicKey, verify } from "node:crypto";

/** The versioned domain separator for a community's immutable first record. */
export const COMMUNITY_GENESIS_SCHEMA = "peer-hours/community-genesis/v1";

/** Immutable, root-signed terms that establish one independently discoverable community scope. */
export type CommunityGenesis = {
  readonly schema: typeof COMMUNITY_GENESIS_SCHEMA;
  readonly communityId: string;
  readonly discoveryKey: string;
  readonly displayName: string;
  readonly location: { readonly locality: string; readonly region?: string; readonly country: string } | null;
  readonly createdAt: string;
  readonly creatorMemberId: string;
  readonly creatorRootPublicKeyPem: string;
  readonly signature: string;
};

/** A portable, bounded invitation that identifies a genesis feed without granting any authority. */
export type CommunityInvitation = {
  readonly schema: "peer-hours/community-invitation/v1";
  readonly communityId: string;
  readonly discoveryKey: string;
};

/** Rejects structurally invalid or incorrectly signed genesis terms before they can select a scope. */
export function createCommunityGenesis(input: CommunityGenesis): CommunityGenesis {
  if (input.schema !== COMMUNITY_GENESIS_SCHEMA) throw new Error("Community genesis must use the supported schema.");
  assertKey(input.communityId, "Community id");
  assertKey(input.discoveryKey, "Discovery key");
  if (typeof input.displayName !== "string" || input.displayName.trim().length === 0 || input.displayName.length > 120) throw new Error("Community name must be between 1 and 120 characters.");
  if (!/^phm_[A-Za-z0-9_-]+$/.test(input.creatorMemberId)) throw new Error("Community genesis creator identity is invalid.");
  if (Number.isNaN(Date.parse(input.createdAt)) || new Date(input.createdAt).toISOString() !== input.createdAt) throw new Error("Community genesis timestamp must be canonical ISO time.");
  if (input.location !== null) {
    if (!nonblank(input.location.locality, 120) || !nonblank(input.location.country, 120) || (input.location.region !== undefined && !nonblank(input.location.region, 120))) throw new Error("Community location is invalid.");
  }
  const signature = decodeSignature(input.signature);
  let publicKey: ReturnType<typeof createPublicKey>;
  try { publicKey = createPublicKey(input.creatorRootPublicKeyPem); } catch { throw new Error("Community genesis root public key is invalid."); }
  if (publicKey.asymmetricKeyType !== "ed25519" || !verify(null, canonicalCommunityGenesisPayload(input), publicKey, signature)) throw new Error("Community genesis signature is invalid.");
  return Object.freeze({ ...input, location: input.location === null ? null : Object.freeze({ ...input.location }) });
}

/** Produces stable bytes for the creator's detached signature, excluding the signature itself. */
export function canonicalCommunityGenesisPayload(genesis: Omit<CommunityGenesis, "signature"> | CommunityGenesis): Buffer {
  return Buffer.from(JSON.stringify({ schema: COMMUNITY_GENESIS_SCHEMA, communityId: genesis.communityId, discoveryKey: genesis.discoveryKey, displayName: genesis.displayName.trim(), location: genesis.location, createdAt: genesis.createdAt, creatorMemberId: genesis.creatorMemberId, creatorRootPublicKeyPem: genesis.creatorRootPublicKeyPem }), "utf8");
}

/** Validates an invitation before it causes a runtime to open or join an untrusted core. */
export function createCommunityInvitation(input: CommunityInvitation): CommunityInvitation {
  if (input.schema !== "peer-hours/community-invitation/v1") throw new Error("Community invitation must use the supported schema.");
  assertKey(input.communityId, "Community invitation community id");
  assertKey(input.discoveryKey, "Community invitation discovery key");
  return Object.freeze({ ...input, communityId: input.communityId.toLowerCase(), discoveryKey: input.discoveryKey.toLowerCase() });
}

/** Serializes a portable invitation as compact URL-safe JSON for copy/paste or a future QR surface. */
export function encodeCommunityInvitation(invitation: CommunityInvitation): string {
  return Buffer.from(JSON.stringify(createCommunityInvitation(invitation)), "utf8").toString("base64url");
}

/** Parses a copied invitation without accepting arbitrary JSON as a community selection. */
export function decodeCommunityInvitation(encoded: string): CommunityInvitation {
  try { return createCommunityInvitation(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CommunityInvitation); } catch { throw new Error("This community invitation is invalid or incomplete."); }
}

/** Checks a hexadecimal Hypercore public or discovery key. */
function assertKey(value: string, label: string): void { if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${label} must be a 64-character hexadecimal key.`); }
/** Checks a bounded human-facing location term. */
function nonblank(value: string, max: number): boolean { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
/** Decodes one URL-safe detached Ed25519 signature. */
function decodeSignature(value: string): Buffer { try { const decoded = Buffer.from(value, "base64url"); if (decoded.length !== 64) throw new Error(); return decoded; } catch { throw new Error("Community genesis signature is invalid."); } }
