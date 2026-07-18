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
  const bootstrapNodes = Object.freeze((input.bootstrapNodes ?? []).map((url, index) => validBootstrapUrl(url, index)));
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
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    return url.toString();
  } catch {
    throw new TypeError(`Bootstrap node ${index + 1} must be an HTTP(S) URL.`);
  }
}
