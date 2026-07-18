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
  const communityNodeUrl = input.communityNodeUrl === undefined ? null : validBootstrapUrl(input.communityNodeUrl, 0);
  return Object.freeze({
    communityId,
    displayName,
    protocolVersion: 1,
    role: "bootstrap",
    capabilities: Object.freeze(["discovery-metadata"] as const),
    coreKey,
    bootstrapNodes,
    communityNodeUrl,
  });
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
