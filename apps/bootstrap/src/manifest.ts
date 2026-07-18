import { createHash, createPublicKey } from "node:crypto";

/** Minimal, non-authoritative metadata used only to help a client join one discovery scope. */
export interface BootstrapManifest {
  readonly communityId: string;
  readonly displayName: string;
  readonly protocolVersion: 1;
  readonly role: "bootstrap";
  readonly capabilities: readonly ["discovery-metadata"];
  readonly coreKey: string;
  readonly bootstrapNodes: readonly string[];
  readonly communityNodeUrl: string | null;
  /** Pinned, non-authoritative community-node identities allowed to sign availability receipts. */
  readonly receiptNodes: readonly ReceiptNodeManifest[];
}

/** Static discovery metadata for one community node that may only attest to retained replication. */
export interface ReceiptNodeManifest {
  readonly nodeId: string;
  readonly publicKey: string;
  readonly receiptUrl: string;
}

const MAX_BOOTSTRAP_NODES = 16;
const MAX_ENDPOINT_URL_LENGTH = 2_048;

/** Builds a validated bootstrap manifest from deployment configuration without operating a peer. */
export function createBootstrapManifest(input: {
  readonly communityId: string;
  readonly displayName: string;
  readonly coreKey: string;
  readonly bootstrapNodes?: readonly string[];
  readonly communityNodeUrl?: string;
  readonly receiptNodes?: readonly ReceiptNodeManifest[];
}): BootstrapManifest {
  const communityId = requiredText(input.communityId, "Community id");
  const displayName = requiredText(input.displayName, "Community display name");
  const coreKey = input.coreKey.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(coreKey)) {
    throw new TypeError("Discovery core key must be a 64-character hexadecimal Hypercore key.");
  }
  const configuredBootstrapNodes = input.bootstrapNodes ?? [];
  if (configuredBootstrapNodes.length > MAX_BOOTSTRAP_NODES) {
    throw new TypeError(`At most ${MAX_BOOTSTRAP_NODES} bootstrap nodes may be configured.`);
  }
  const bootstrapNodes = Object.freeze(configuredBootstrapNodes.map((url, index) => validBootstrapUrl(url, index)));
  if (new Set(bootstrapNodes).size !== bootstrapNodes.length) {
    throw new TypeError("Bootstrap nodes must not contain duplicate URLs.");
  }
  const communityNodeUrl = input.communityNodeUrl === undefined ? null : validBootstrapUrl(input.communityNodeUrl, 0);
  const receiptNodes = Object.freeze((input.receiptNodes ?? []).map((node, index) => validReceiptNode(node, index)));
  if (new Set(receiptNodes.map((node) => node.nodeId)).size !== receiptNodes.length) {
    throw new TypeError("Receipt nodes must not contain duplicate node identities.");
  }
  if (new Set(receiptNodes.map((node) => node.receiptUrl)).size !== receiptNodes.length) {
    throw new TypeError("Receipt nodes must not contain duplicate receipt URLs.");
  }
  return Object.freeze({
    communityId,
    displayName,
    protocolVersion: 1,
    role: "bootstrap",
    capabilities: Object.freeze(["discovery-metadata"] as const),
    coreKey,
    bootstrapNodes,
    communityNodeUrl,
    receiptNodes,
  });
}

/** Validates static receipt metadata without allowing bootstrap to mint or control a node identity. */
function validReceiptNode(value: ReceiptNodeManifest, index: number): ReceiptNodeManifest {
  if (value === null || typeof value !== "object") throw new TypeError(`Receipt node ${index + 1} must be an object.`);
  if (!/^[a-f0-9]{64}$/i.test(value.nodeId)) throw new TypeError(`Receipt node ${index + 1} must have a SHA-256 node id.`);
  const publicKey = validReceiptPublicKey(value.publicKey, index);
  const nodeId = createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest("hex");
  if (nodeId !== value.nodeId.toLowerCase()) throw new TypeError(`Receipt node ${index + 1} node id must match its public key.`);
  const receiptUrl = validBootstrapUrl(value.receiptUrl, index);
  if (!new URL(receiptUrl).pathname.endsWith("/receipts/")) throw new TypeError(`Receipt node ${index + 1} receipt URL must end in /receipts/.`);
  return Object.freeze({ nodeId, publicKey, receiptUrl });
}

/** Accepts only canonical base64url SPKI material for an Ed25519 receipt identity. */
function validReceiptPublicKey(value: string, index: number): string {
  if (!/^[A-Za-z0-9_-]{40,256}$/.test(value)) throw new TypeError(`Receipt node ${index + 1} must have a base64url public key.`);
  try {
    const parsed = createPublicKey({ key: Buffer.from(value, "base64url"), format: "der", type: "spki" });
    if (parsed.asymmetricKeyType !== "ed25519") throw new Error("wrong algorithm");
    return Buffer.from(value, "base64url").toString("base64url");
  } catch {
    throw new TypeError(`Receipt node ${index + 1} must have an Ed25519 SPKI public key.`);
  }
}

/** Requires readable configuration text rather than silently serving an incomplete community scope. */
function requiredText(value: string, label: string): string {
  if (value.trim().length === 0) throw new TypeError(`${label} is required.`);
  return value;
}

/** Limits optional fallback bootstrap endpoints to safe web URLs. */
function validBootstrapUrl(value: string, index: number): string {
  if (value.length === 0 || value.length > MAX_ENDPOINT_URL_LENGTH) {
    throw new TypeError(`Bootstrap node ${index + 1} must be a valid HTTP(S) URL.`);
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash) {
      throw new Error("unsupported URL shape");
    }
    return url.toString();
  } catch {
    throw new TypeError(`Bootstrap node ${index + 1} must be an HTTP(S) URL.`);
  }
}
