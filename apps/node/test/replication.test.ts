import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Corestore from "corestore";

test("replicates an event between two independent stores", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-replication-"));
  const firstStore = new Corestore(join(directory, "first"));
  const secondStore = new Corestore(join(directory, "second"));

  try {
    const firstCore = firstStore.get({ name: "events", valueEncoding: "json" });
    await firstCore.ready();
    const secondCore = secondStore.get({ key: firstCore.key, valueEncoding: "json" });
    await secondCore.ready();

    const firstReplication = firstStore.replicate(true);
    const secondReplication = secondStore.replicate(false);
    firstReplication.pipe(secondReplication).pipe(firstReplication);

    await firstCore.append({
      type: "offer.created",
      memberId: "member-a",
      description: "Help with gardening",
      hours: 2,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("replication timed out")), 2_000);
      const check = () => {
        if (secondCore.length === 1) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        setTimeout(check, 10);
      };
      check();
    });

    assert.deepEqual(await secondCore.get(0), {
      type: "offer.created",
      memberId: "member-a",
      description: "Help with gardening",
      hours: 2,
    });

    await firstReplication.destroy();
    await secondReplication.destroy();
  } finally {
    await firstStore.close();
    await secondStore.close();
    await rm(directory, { recursive: true, force: true });
  }
});
