# Node App Agent Rules

## Purpose

This is a headless, continuously running Peer Hours node. It is infrastructure for persistence, discovery, and replication—not the member-facing application and not the complete timebank ledger.

This is the independently deployable community node. It is distinct from the peer runtime embedded in the desktop app. It should be usable as a local development fixture and as a remote community node.

## First infrastructure milestone: observability

The node must provide rich, trustworthy connection status before domain features are added. Make it possible for the desktop app and operators to inspect:

- Node identity and uptime
- Listening/discovery state
- Configured communities or replication topics
- Connected peers and stable peer identifiers
- Connection direction and transport details where available
- Last seen, connection duration, and reconnect attempts
- Replication progress, lag, and errors
- Local persistence health

Status should come from actual node state, not optimistic client assumptions. Prefer structured status data that can support both a polished desktop view and operational logs or health endpoints.

## Architecture

- Keep the node deployable as a standalone process.
- Persist node data under `DATA_DIR`; never rely on the ephemeral application filesystem in production.
- Local development data defaults to `apps/node/data/` and must never be committed. Keep this path ignored and use a separate backup/export process for any data that should be preserved.
- Respect the `PORT` environment variable and bind public HTTP services to `0.0.0.0`.
- Keep health checks lightweight and free of mutation.
- Treat replicated data as append-oriented and verifiable.
- Do not add mutable balance updates or unsigned transaction writes.
- Keep Holepunch transport concerns separate from future Peer Hours domain rules.
- Do not assume that an HTTP API replaces peer replication.

## Testing

Node tests should cover persistence and replication behavior, not only HTTP handlers. Prefer temporary directories and deterministic local replication streams for integration tests.

Run the node checks with:

```sh
npm --workspace @peer-hours/node test
npm --workspace @peer-hours/node run typecheck
npm --workspace @peer-hours/node run build
```

Tests must clean up temporary storage and close stores, replication streams, sockets, and servers.

## Deployment safety

- Treat node storage as durable application data.
- Handle `SIGTERM` and `SIGINT` gracefully.
- Do not make a deployment depend on local development paths.
- Document any assumptions about Render, VPS hosting, persistent disks, ports, or peer discovery.
- Avoid destructive migrations until backup and recovery behavior has been designed.
