import { resolve } from "node:path";

/** Process configuration needed to run an independently deployed community node. */
export type NodeConfiguration = {
  port: number;
  dataDirectory: string;
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

  return {
    port,
    dataDirectory: resolve(workingDirectory, configuredDirectory ?? "data"),
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
