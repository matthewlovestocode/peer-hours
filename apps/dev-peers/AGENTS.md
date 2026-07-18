# Development Peers Agent Rules

This app provides independent simulated peers for desktop and network UI development. It is development infrastructure, not a production application.

- Use `@peer-hours/peer-runtime`; do not invent a separate networking implementation.
- Give every simulated peer a separate data directory and identity.
- Keep simulated registration clearly marked as `simulated`; never present it as proof of a live Hyperswarm transport connection.
- Make peer count and bootstrap URL configurable through environment variables.
- Always unregister simulated peers and close runtimes on shutdown.
- Keep this app dependency-light and focused on repeatable network scenarios.

Run it with:

```sh
npm --workspace @peer-hours/dev-peers run build
PEER_COUNT=5 npm --workspace @peer-hours/dev-peers run start
```
