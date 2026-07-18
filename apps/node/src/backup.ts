import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const BACKUP_MANIFEST_FILE = "peer-hours-node-backup.json";
const BACKUP_SCHEMA = "peer-hours/node-backup/v1";

/** One regular file captured in a complete, content-addressed node-data backup. */
export interface BackupFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Portable inventory for a whole-node backup; it deliberately contains no absolute source path. */
export interface NodeBackupManifest {
  readonly schema: typeof BACKUP_SCHEMA;
  readonly createdAt: string;
  readonly files: readonly BackupFile[];
}

/** Parameters for creating a backup only after the operator has stopped the node. */
export interface CreateNodeBackupOptions {
  readonly sourceDirectory: string;
  readonly destinationDirectory: string;
  readonly nodeStopped: boolean;
  readonly now?: () => Date;
}

/** Successful verification result suitable for runbook output or restore preflight. */
export interface BackupVerification {
  readonly manifest: NodeBackupManifest;
  readonly backupDirectory: string;
}

/** Creates an immutable-style complete directory snapshot and a SHA-256 verification manifest. */
export async function createNodeBackup(options: CreateNodeBackupOptions): Promise<BackupVerification> {
  requireStoppedNode(options.nodeStopped);
  const sourceDirectory = resolve(options.sourceDirectory);
  const destinationDirectory = resolve(options.destinationDirectory);
  await assertDirectory(sourceDirectory, "source directory");
  assertSeparateDirectories(sourceDirectory, destinationDirectory);
  await assertMissing(destinationDirectory, "backup destination");

  const stagingDirectory = joinSibling(destinationDirectory, `.peer-hours-backup-${randomUUID()}`);
  await assertMissing(stagingDirectory, "backup staging directory");
  try {
    await cp(sourceDirectory, stagingDirectory, { recursive: true, errorOnExist: true, verbatimSymlinks: true });
    const files = await inventoryFiles(stagingDirectory);
    const manifest: NodeBackupManifest = Object.freeze({
      schema: BACKUP_SCHEMA,
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
      files: Object.freeze(files),
    });
    await writeFile(resolve(stagingDirectory, BACKUP_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(stagingDirectory, destinationDirectory);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
  return verifyNodeBackup(destinationDirectory);
}

/** Recomputes every manifest digest and rejects missing, extra, symlinked, or malformed backup content. */
export async function verifyNodeBackup(backupDirectory: string): Promise<BackupVerification> {
  const resolvedBackupDirectory = resolve(backupDirectory);
  await assertDirectory(resolvedBackupDirectory, "backup directory");
  const manifest = await readManifest(resolvedBackupDirectory);
  const actualFiles = await inventoryFiles(resolvedBackupDirectory, new Set([BACKUP_MANIFEST_FILE]));
  const expected = new Map(manifest.files.map((file) => [file.path, file]));
  if (expected.size !== manifest.files.length) throw new Error("Backup manifest contains duplicate file paths.");
  if (actualFiles.length !== expected.size) throw new Error("Backup contents do not match the manifest file count.");
  for (const actual of actualFiles) {
    const declared = expected.get(actual.path);
    if (!declared || declared.bytes !== actual.bytes || declared.sha256 !== actual.sha256) {
      throw new Error(`Backup file verification failed for ${actual.path}.`);
    }
  }
  return Object.freeze({ manifest, backupDirectory: resolvedBackupDirectory });
}

/** Verifies a backup and confirms restoring it cannot overwrite an existing node data directory. */
export async function preflightNodeRestore(backupDirectory: string, destinationDirectory: string): Promise<BackupVerification> {
  const verification = await verifyNodeBackup(backupDirectory);
  const destination = resolve(destinationDirectory);
  assertSeparateDirectories(verification.backupDirectory, destination);
  await assertMissing(destination, "restore destination");
  return verification;
}

/** Restores a verified backup into a new directory without touching a prior node data directory. */
export async function restoreNodeBackup(options: {
  readonly backupDirectory: string;
  readonly destinationDirectory: string;
  readonly nodeStopped: boolean;
}): Promise<BackupVerification> {
  requireStoppedNode(options.nodeStopped);
  const verification = await preflightNodeRestore(options.backupDirectory, options.destinationDirectory);
  const destination = resolve(options.destinationDirectory);
  const stagingDirectory = joinSibling(destination, `.peer-hours-restore-${randomUUID()}`);
  await assertMissing(stagingDirectory, "restore staging directory");
  try {
    await cp(verification.backupDirectory, stagingDirectory, {
      recursive: true,
      errorOnExist: true,
      filter: (source) => resolve(source) !== resolve(verification.backupDirectory, BACKUP_MANIFEST_FILE),
      verbatimSymlinks: true,
    });
    await rename(stagingDirectory, destination);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
  return verification;
}

/** Reads and validates a deliberately small manifest format before its paths influence verification. */
async function readManifest(backupDirectory: string): Promise<NodeBackupManifest> {
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(resolve(backupDirectory, BACKUP_MANIFEST_FILE), "utf8")); }
  catch { throw new Error("Backup manifest is missing or is not valid JSON."); }
  if (!isObject(parsed) || parsed.schema !== BACKUP_SCHEMA || typeof parsed.createdAt !== "string" || !Array.isArray(parsed.files)) {
    throw new Error("Backup manifest has an unsupported shape.");
  }
  if (!Number.isFinite(Date.parse(parsed.createdAt))) throw new Error("Backup manifest has an invalid creation time.");
  const files = parsed.files.map((file): BackupFile => {
    if (!isObject(file) || typeof file.path !== "string" || !isSafeBackupPath(file.path) || typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error("Backup manifest contains an invalid file entry.");
    }
    return Object.freeze({ path: file.path, bytes: file.bytes, sha256: file.sha256 });
  });
  return Object.freeze({ schema: BACKUP_SCHEMA, createdAt: parsed.createdAt, files: Object.freeze(files) });
}

/** Walks regular files deterministically and rejects links or device-like entries that make a backup ambiguous. */
async function inventoryFiles(root: string, ignored = new Set<string>()): Promise<BackupFile[]> {
  const files: BackupFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        if (ignored.has(path)) continue;
        const contents = await readFile(absolute);
        files.push(Object.freeze({ path, bytes: contents.byteLength, sha256: createHash("sha256").update(contents).digest("hex") }));
      } else {
        throw new Error(`Backup does not support symbolic links or special file entries: ${path}.`);
      }
    }
  };
  await visit(root);
  return files;
}

/** Requires an explicit stopped-node acknowledgement because filesystem copy is not a live Corestore snapshot. */
function requireStoppedNode(nodeStopped: boolean): void {
  if (!nodeStopped) throw new Error("Refusing to copy live node storage. Stop the node cleanly and pass --node-stopped.");
}

/** Ensures a path exists and is a real directory, rather than following a backup target by accident. */
async function assertDirectory(path: string, label: string): Promise<void> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`${label} must be an existing directory: ${path}`);
}

/** Rejects existing targets so neither backup nor restore can silently replace operator data. */
async function assertMissing(path: string, label: string): Promise<void> {
  if (await lstat(path).catch(() => undefined)) throw new Error(`${label} already exists: ${path}`);
  await mkdir(dirname(path), { recursive: true });
}

/** Rejects a destination inside its source or backup, where recursive copying would be unsafe. */
function assertSeparateDirectories(source: string, destination: string): void {
  if (source === destination || destination.startsWith(`${source}${sep}`) || source.startsWith(`${destination}${sep}`)) {
    throw new Error("Backup and destination directories must be separate, non-nested paths.");
  }
}

/** Builds a staging path beside a final target so final publication is one rename operation. */
function joinSibling(target: string, name: string): string {
  return resolve(dirname(target), name);
}

/** Ensures manifest file paths cannot be absolute or escape the backup root. */
function isSafeBackupPath(path: string): boolean {
  return path.length > 0 && !isAbsolute(path) && !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..");
}

/** Narrows unknown JSON values without inheriting prototype properties. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
