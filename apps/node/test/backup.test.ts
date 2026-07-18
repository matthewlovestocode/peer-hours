import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createNodeBackup, preflightNodeRestore, restoreNodeBackup, verifyNodeBackup } from "../src/backup.js";

/** Builds a small complete node-data fixture without using any repository runtime directory. */
async function createSource(directory: string): Promise<string> {
  const source = join(directory, "node-data");
  await mkdir(join(source, "db"), { recursive: true });
  await writeFile(join(source, "db", "CURRENT"), "manifest-000001\n", "utf8");
  await writeFile(join(source, "CORESTORE"), "store-state", "utf8");
  await writeFile(join(source, "receipt-identity.pem"), "private-key-material", "utf8");
  return source;
}

test("creates a complete verified backup and restores it only into a fresh destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-backup-"));
  try {
    const source = await createSource(directory);
    const backup = join(directory, "daily-backup");
    const created = await createNodeBackup({ sourceDirectory: source, destinationDirectory: backup, nodeStopped: true, now: () => new Date("2026-07-18T12:00:00.000Z") });
    assert.equal(created.manifest.files.length, 3);
    assert.equal(created.manifest.createdAt, "2026-07-18T12:00:00.000Z");
    assert.equal((await verifyNodeBackup(backup)).manifest.files.length, 3);

    const restored = join(directory, "restored-data");
    await preflightNodeRestore(backup, restored);
    await restoreNodeBackup({ backupDirectory: backup, destinationDirectory: restored, nodeStopped: true });
    assert.equal(await readFile(join(restored, "db", "CURRENT"), "utf8"), "manifest-000001\n");
    assert.equal(await readFile(join(restored, "receipt-identity.pem"), "utf8"), "private-key-material");
    await assert.rejects(() => preflightNodeRestore(backup, restored), /already exists/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects live copies, tampered backups, and a target nested in source storage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-backup-safety-"));
  try {
    const source = await createSource(directory);
    const backup = join(directory, "backup");
    await assert.rejects(() => createNodeBackup({ sourceDirectory: source, destinationDirectory: backup, nodeStopped: false }), /Stop the node cleanly/);
    await assert.rejects(() => createNodeBackup({ sourceDirectory: source, destinationDirectory: join(source, "backup"), nodeStopped: true }), /non-nested/);
    await createNodeBackup({ sourceDirectory: source, destinationDirectory: backup, nodeStopped: true });
    await writeFile(join(backup, "CORESTORE"), "tampered", "utf8");
    await assert.rejects(() => verifyNodeBackup(backup), /verification failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects additional files that are not covered by a backup manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-node-backup-extra-"));
  try {
    const source = await createSource(directory);
    const backup = join(directory, "backup");
    await createNodeBackup({ sourceDirectory: source, destinationDirectory: backup, nodeStopped: true });
    await writeFile(join(backup, "untracked.txt"), "unexpected", "utf8");
    await assert.rejects(() => verifyNodeBackup(backup), /file count/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
