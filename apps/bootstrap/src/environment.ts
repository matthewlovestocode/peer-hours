import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Absolute path to the optional deployment-owned environment file for this service. */
export const bootstrapEnvironmentFile = fileURLToPath(new URL("../.env", import.meta.url));

/** Loads this service's optional `.env` file without replacing explicitly supplied process variables. */
export function loadBootstrapEnvironment(filePath: string = bootstrapEnvironmentFile): boolean {
  if (!existsSync(filePath)) return false;
  process.loadEnvFile(filePath);
  return true;
}
