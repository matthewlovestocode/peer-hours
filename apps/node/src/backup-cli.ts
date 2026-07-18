import { createNodeBackup, preflightNodeRestore, restoreNodeBackup, verifyNodeBackup } from "./backup.js";

/** Runs the intentionally narrow node backup and restore commands used by operators. */
async function main(arguments_: readonly string[]): Promise<void> {
  const [command, ...rest] = arguments_;
  const options = parseOptions(rest);
  switch (command) {
    case "create": {
      const result = await createNodeBackup({ sourceDirectory: required(options, "source"), destinationDirectory: required(options, "destination"), nodeStopped: flag(options, "node-stopped") });
      print("backup created and verified", result);
      return;
    }
    case "verify": {
      const result = await verifyNodeBackup(required(options, "backup"));
      print("backup verified", result);
      return;
    }
    case "restore-preflight": {
      const result = await preflightNodeRestore(required(options, "backup"), required(options, "destination"));
      print("restore preflight passed", result);
      return;
    }
    case "restore": {
      const result = await restoreNodeBackup({ backupDirectory: required(options, "backup"), destinationDirectory: required(options, "destination"), nodeStopped: flag(options, "node-stopped") });
      print("backup restored into new destination", result);
      return;
    }
    default: throw new Error("Usage: backup <create|verify|restore-preflight|restore> with documented --options.");
  }
}

/** Parses only simple --name value and --name flags, rejecting positional or duplicate options. */
function parseOptions(arguments_: readonly string[]): Map<string, string | true> {
  const options = new Map<string, string | true>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument.startsWith("--") || argument.length === 2) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    if (!/^[a-z-]+$/.test(name) || options.has(name)) throw new Error(`Invalid or duplicate option: ${argument}`);
    const next = arguments_[index + 1];
    if (next === undefined || next.startsWith("--")) options.set(name, true);
    else { options.set(name, next); index += 1; }
  }
  return options;
}

/** Reads one required non-flag option. */
function required(options: Map<string, string | true>, name: string): string {
  const value = options.get(name);
  if (typeof value !== "string" || value.length === 0) throw new Error(`--${name} is required.`);
  return value;
}

/** Reads an explicit flag and rejects an accidental value. */
function flag(options: Map<string, string | true>, name: string): boolean {
  const value = options.get(name);
  if (value === undefined) return false;
  if (value !== true) throw new Error(`--${name} does not accept a value.`);
  return true;
}

/** Prints manifest facts without ever including a private node identity or source path. */
function print(message: string, result: { backupDirectory: string; manifest: { createdAt: string; files: readonly unknown[] } }): void {
  console.log(JSON.stringify({ ok: true, message, backupDirectory: result.backupDirectory, createdAt: result.manifest.createdAt, fileCount: result.manifest.files.length }));
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Backup command failed.");
  process.exitCode = 1;
});
