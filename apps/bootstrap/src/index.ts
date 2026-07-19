import { resolveBootstrapConfiguration } from "./config.js";
import { loadBootstrapEnvironment } from "./environment.js";
import { createBootstrapServer } from "./server.js";

loadBootstrapEnvironment();
const { port, manifest } = resolveBootstrapConfiguration();
const server = createBootstrapServer(manifest);

server.listen(port, "0.0.0.0", () => {
  console.log(`Peer Hours bootstrap service listening on port ${port}`);
  console.log(`Discovery scope: ${manifest.communityId}`);
});

/** Gracefully stops HTTP intake; repeated operating-system signals share one close operation. */
let shutdownPromise: Promise<void> | undefined;
const shutdown = (): Promise<void> => {
  shutdownPromise ??= new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") return;
    throw error;
  });
  return shutdownPromise;
};

process.once("SIGINT", () => void shutdown().catch((error: unknown) => { console.error("Peer Hours bootstrap shutdown failed:", error); process.exitCode = 1; }));
process.once("SIGTERM", () => void shutdown().catch((error: unknown) => { console.error("Peer Hours bootstrap shutdown failed:", error); process.exitCode = 1; }));
