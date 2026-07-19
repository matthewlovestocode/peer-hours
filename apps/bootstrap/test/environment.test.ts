import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadBootstrapEnvironment } from "../src/environment.js";

test("loads an explicitly selected bootstrap environment file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peer-hours-bootstrap-env-"));
  const filePath = join(directory, ".env");
  const variableName = "PEER_HOURS_BOOTSTRAP_ENV_TEST";
  const previousValue = process.env[variableName];

  try {
    await writeFile(filePath, `${variableName}=loaded-from-file\n`, "utf8");
    delete process.env[variableName];

    assert.equal(loadBootstrapEnvironment(filePath), true);
    assert.equal(process.env[variableName], "loaded-from-file");
    assert.equal(loadBootstrapEnvironment(join(directory, "missing.env")), false);
  } finally {
    if (previousValue === undefined) delete process.env[variableName];
    else process.env[variableName] = previousValue;
    await rm(directory, { recursive: true, force: true });
  }
});
