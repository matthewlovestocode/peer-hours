import { createBootstrapManifest, type BootstrapManifest } from "./manifest.js";

/** Process configuration required by the read-only optional bootstrap service. */
export interface BootstrapConfiguration {
  readonly port: number;
  readonly manifest: BootstrapManifest;
}

/** Resolves deployment configuration before the bootstrap HTTP service begins listening. */
export function resolveBootstrapConfiguration(environment: NodeJS.ProcessEnv = process.env): BootstrapConfiguration {
  return {
    port: parsePort(environment.PORT),
    manifest: createBootstrapManifest({
      communityId: environment.COMMUNITY_ID ?? "peer-hours/earth/US/CA/east-bay/oakland",
      displayName: environment.COMMUNITY_NAME ?? "Oakland Timebank",
      coreKey: environment.DISCOVERY_CORE_KEY ?? "",
      bootstrapNodes: parseBootstrapNodes(environment.BOOTSTRAP_NODES),
      ...(environment.COMMUNITY_NODE_URL === undefined ? {} : { communityNodeUrl: environment.COMMUNITY_NODE_URL }),
    }),
  };
}

/** Parses comma-separated optional bootstrap URLs while rejecting blank entries that hide configuration errors. */
function parseBootstrapNodes(value: string | undefined): readonly string[] {
  if (value === undefined || value.length === 0) return [];
  const nodes = value.split(",").map((entry) => entry.trim());
  if (nodes.some((entry) => entry.length === 0)) {
    throw new TypeError("BOOTSTRAP_NODES must not contain blank URLs.");
  }
  return nodes;
}

/** Accepts only an explicit TCP port in the range supported by Node's HTTP server. */
function parsePort(value: string | undefined): number {
  if (value === undefined) return 10_001;
  if (!/^[0-9]+$/.test(value)) throw new TypeError("PORT must be an integer between 1 and 65535.");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("PORT must be an integer between 1 and 65535.");
  }
  return port;
}
