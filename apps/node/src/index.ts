import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import Corestore from "corestore";
import Hyperswarm from "hyperswarm";
import { createHealthPayload } from "./health.js";

const port = Number(process.env.PORT ?? 10000);
const dataDirectory = process.env.DATA_DIR ?? join(process.cwd(), "data");

await mkdir(dataDirectory, { recursive: true });

const store = new Corestore(dataDirectory);
const core = store.get({ name: "peer-hours-network", valueEncoding: "json" });
await core.ready();

const swarm = new Hyperswarm();
void swarm.listen().then(() => console.log("swarm listening"));
swarm.join(core.discoveryKey, { server: true, client: true });

swarm.on("connection", (connection: { on: Function }) => {
  store.replicate(connection);
  console.log("peer connected");
  connection.on("close", () => console.log("peer disconnected"));
});

const server = createServer((request, response) => {
  if (request.url === "/health" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(createHealthPayload(core)));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Peer Hours node listening on port ${port}`);
  console.log(`Storage directory: ${dataDirectory}`);
  console.log(`Core key: ${core.key.toString("hex")}`);
});

const shutdown = async () => {
  server.close();
  await swarm.destroy();
  await store.close();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
