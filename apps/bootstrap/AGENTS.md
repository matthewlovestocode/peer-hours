# Bootstrap App Agent Rules

## Purpose

This application is a minimal, optional onboarding service. It serves static community discovery metadata to a desktop application that does not already have a discovery-core key.

It is not a peer, community peer, record store, directory authority, membership service, or timebank administrator. It must not run Corestore or Hyperswarm, retain member feeds, accept member records, identify users, track clients, or decide who may participate.

## Design rules

- Keep the public surface to `GET /bootstrap` and a lightweight `GET /health` check unless a concrete, non-authoritative need is established.
- Source the discovery-core key and metadata from deployment configuration; never derive it by operating a peer process.
- Do not add databases, sessions, analytics, accounts, registration, rate-based participation controls, or write endpoints.
- A bootstrap outage must not invalidate a configured or invited community: clients may use a pinned discovery-core key or another bootstrap endpoint.
- Treat the manifest as a convenience trust entry point, not proof of community authority. Future signed or pinned manifests must remain possible.

## Validation

Run focused checks after changes:

```sh
npm --workspace @peer-hours/bootstrap test
npm --workspace @peer-hours/bootstrap run typecheck
npm --workspace @peer-hours/bootstrap run build
```
