import { resolve } from "node:path";

/** Process configuration needed to run an independently deployed community node. */
export type NodeConfiguration = {
  port: number;
  dataDirectory: string;
  bootstrapKey: string | undefined;
  enableDevelopmentPeerRegistration: boolean;
};

/** Resolves and validates process configuration before the runtime opens durable storage. */
export function resolveNodeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): NodeConfiguration {
  const port = parsePort(environment.PORT);
  const configuredDirectory = environment.DATA_DIR;
  if (configuredDirectory !== undefined && configuredDirectory.trim().length === 0) {
    throw new Error("DATA_DIR must not be blank when configured.");
  }
  if (configuredDirectory !== undefined && configuredDirectory !== configuredDirectory.trim()) {
    throw new Error("DATA_DIR must not have leading or trailing whitespace when configured.");
  }

  return {
    port,
    dataDirectory: resolve(workingDirectory, configuredDirectory ?? "data"),
    bootstrapKey: optionalCoreKey(environment.PEER_HOURS_BOOTSTRAP_KEY),
    enableDevelopmentPeerRegistration: parseBoolean(environment.ENABLE_DEV_PEER_REGISTRATION, "ENABLE_DEV_PEER_REGISTRATION"),
  };
}

/** Accepts only an explicit TCP port in the range supported by Node's HTTP server. */
function parsePort(value: string | undefined): number {
  if (value === undefined) return 10_000;
  if (!/^[0-9]+$/.test(value)) throw new Error("PORT must be an integer between 1 and 65535.");

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

/** Validates an optional discovery-core key before durable storage or networking is opened. */
function optionalCoreKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("PEER_HOURS_BOOTSTRAP_KEY must be a 64-character hexadecimal Hypercore key when configured.");
  }
  return value.toLowerCase();
}

/** Accepts development-only switches only when explicitly set to true or false. */
function parseBoolean(value: string | undefined, name: string): boolean {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false when configured.`);
}
