import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

/** The fixed schema carried by a community node's non-authoritative retention receipt. */
export const REPLICATION_RECEIPT_SCHEMA = "peer-hours/replication-receipt/v1";

/** A pinned community-node identity allowed to make availability claims for one community. */
export interface CommunityReceiptNode {
  /** Stable SHA-256 identifier derived from the pinned Ed25519 public key. */
  readonly nodeId: string;
  /** Ed25519 SPKI DER public key encoded as base64url. */
  readonly publicKey: string;
  /** HTTPS or explicitly local HTTP endpoint serving read-only receipt lookups. */
  readonly receiptUrl: string;
}

/** A signed claim that one community node retains one locally resolved transfer, never a finality decision. */
export interface SignedReplicationReceipt {
  readonly schema: typeof REPLICATION_RECEIPT_SCHEMA;
  readonly version: 1;
  readonly communityId: string;
  readonly transferId: string;
  /** SHA-256 digest of the exact locally resolved transfer JSON. */
  readonly transferDigest: string;
  readonly retainedAt: string;
  readonly nodeId: string;
  readonly publicKey: string;
  readonly signature: string;
}

/** Creates the stable node identifier that bootstrap metadata pins alongside its public key. */
export function replicationReceiptNodeId(publicKey: string): string {
  const key = decodePublicKey(publicKey);
  return createHash("sha256").update(key).digest("hex");
}

/** Computes the content digest a receipt binds to without assigning any timebank validity or finality. */
export function replicationReceiptTransferDigest(transfer: unknown): string {
  return createHash("sha256").update(canonicalJson(transfer), "utf8").digest("hex");
}

/** Signs a bounded retention claim using the community node's persistent Ed25519 private key. */
export function createReplicationReceipt(input: {
  readonly communityId: string;
  readonly transferId: string;
  readonly transferDigest: string;
  readonly retainedAt: string;
  readonly privateKey: KeyObject;
  readonly publicKey: string;
}): SignedReplicationReceipt {
  const communityId = requiredText(input.communityId, "communityId");
  const transferId = requiredText(input.transferId, "transferId");
  const transferDigest = sha256Hex(input.transferDigest, "transferDigest");
  const retainedAt = validTimestamp(input.retainedAt);
  const publicKey = normalizePublicKey(input.publicKey);
  const nodeId = replicationReceiptNodeId(publicKey);
  const unsigned = { schema: REPLICATION_RECEIPT_SCHEMA as typeof REPLICATION_RECEIPT_SCHEMA, version: 1 as const, communityId, transferId, transferDigest, retainedAt, nodeId, publicKey };
  return Object.freeze({ ...unsigned, signature: sign(null, Buffer.from(canonicalJson(unsigned)), input.privateKey).toString("base64url") });
}

/** Verifies a receipt cryptographically and against a pinned node identity; false never rejects or changes a transfer. */
export function verifyReplicationReceipt(input: {
  readonly receipt: unknown;
  readonly trustedNodes: readonly CommunityReceiptNode[];
  readonly communityId?: string;
  readonly transferId?: string;
  readonly transferDigest?: string;
}): boolean {
  try {
    const receipt = normalizeReceipt(input.receipt);
    if (input.communityId !== undefined && receipt.communityId !== input.communityId) return false;
    if (input.transferId !== undefined && receipt.transferId !== input.transferId) return false;
    if (input.transferDigest !== undefined && receipt.transferDigest !== input.transferDigest.toLowerCase()) return false;
    const trusted = input.trustedNodes.find((node) => node.nodeId === receipt.nodeId && node.publicKey === receipt.publicKey);
    if (!trusted) return false;
    const unsigned = { schema: receipt.schema, version: receipt.version, communityId: receipt.communityId, transferId: receipt.transferId, transferDigest: receipt.transferDigest, retainedAt: receipt.retainedAt, nodeId: receipt.nodeId, publicKey: receipt.publicKey };
    return verify(null, Buffer.from(canonicalJson(unsigned)), createPublicKey({ key: decodePublicKey(receipt.publicKey), format: "der", type: "spki" }), Buffer.from(receipt.signature, "base64url"));
  } catch {
    return false;
  }
}

/** Validates bootstrap receipt-node metadata before it becomes a pinned source of availability labels. */
export function normalizeCommunityReceiptNode(value: unknown, field = "receipt node"): CommunityReceiptNode {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object.`);
  const publicKey = normalizePublicKey(requiredText(value.publicKey, `${field}.publicKey`));
  const nodeId = sha256Hex(requiredText(value.nodeId, `${field}.nodeId`), `${field}.nodeId`);
  if (nodeId !== replicationReceiptNodeId(publicKey)) throw new TypeError(`${field}.nodeId must match its publicKey.`);
  const receiptUrl = validReceiptUrl(requiredText(value.receiptUrl, `${field}.receiptUrl`), field);
  return Object.freeze({ nodeId, publicKey, receiptUrl });
}

/** Canonicalizes plain JSON data so different key insertion orders cannot change a transfer receipt digest. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Receipt data must contain finite JSON numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new TypeError("Receipt data must contain only JSON values.");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

/** Narrows JSON-shaped values without accepting prototype-bearing objects into signed data. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** Requires a readable identifier instead of signing ambiguous blank values. */
function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) throw new TypeError(`${field} must be nonblank text without surrounding whitespace.`);
  return value;
}

/** Validates one lowercase SHA-256 encoding. */
function sha256Hex(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new TypeError(`${field} must be a 64-character hexadecimal SHA-256 digest.`);
  return value.toLowerCase();
}

/** Decodes exactly one Ed25519 SPKI DER public key before it can be pinned or used for verification. */
function decodePublicKey(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]{40,256}$/.test(value)) throw new TypeError("Receipt publicKey must be base64url Ed25519 SPKI DER.");
  const key = Buffer.from(value, "base64url");
  const parsed = createPublicKey({ key, format: "der", type: "spki" });
  if (parsed.asymmetricKeyType !== "ed25519") throw new TypeError("Receipt publicKey must be an Ed25519 key.");
  return key;
}

/** Normalizes the safe textual public-key form after parsing its cryptographic structure. */
function normalizePublicKey(value: string): string {
  return decodePublicKey(value).toString("base64url");
}

/** Rejects invalid or ambiguous times before they enter a signed retention statement. */
function validTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value))) throw new TypeError("retainedAt must be an ISO-8601 UTC timestamp.");
  return value;
}

/** Restricts receipt endpoints to public web addresses without credentials or fragments. */
function validReceiptUrl(value: string, field: string): string {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash || !url.pathname.endsWith("/receipts/")) throw new Error("unsafe URL");
    return url.toString();
  } catch {
    throw new TypeError(`${field}.receiptUrl must be an HTTP(S) URL ending in /receipts/.`);
  }
}

/** Normalizes untrusted HTTP JSON before cryptographic verification. */
function normalizeReceipt(value: unknown): SignedReplicationReceipt {
  if (!isRecord(value) || value.schema !== REPLICATION_RECEIPT_SCHEMA || value.version !== 1) throw new TypeError("Receipt has an unsupported schema.");
  const publicKey = normalizePublicKey(requiredText(value.publicKey, "receipt.publicKey"));
  const nodeId = sha256Hex(requiredText(value.nodeId, "receipt.nodeId"), "receipt.nodeId");
  if (nodeId !== replicationReceiptNodeId(publicKey)) throw new TypeError("Receipt nodeId must match publicKey.");
  const signature = requiredText(value.signature, "receipt.signature");
  if (!/^[A-Za-z0-9_-]{80,200}$/.test(signature)) throw new TypeError("Receipt signature must be base64url Ed25519 data.");
  return { schema: REPLICATION_RECEIPT_SCHEMA, version: 1, communityId: requiredText(value.communityId, "receipt.communityId"), transferId: requiredText(value.transferId, "receipt.transferId"), transferDigest: sha256Hex(requiredText(value.transferDigest, "receipt.transferDigest"), "receipt.transferDigest"), retainedAt: validTimestamp(requiredText(value.retainedAt, "receipt.retainedAt")), nodeId, publicKey, signature };
}
