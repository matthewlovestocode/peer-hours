# @peer-hours/bootstrap

`@peer-hours/bootstrap` is a minimal, optional onboarding service for Peer Hours. It serves a configured discovery manifest at `GET /bootstrap` so a new desktop can learn the public discovery-core key for one community.

It is a private monorepo application, not a published npm package and not a required part of the timebank protocol.

```mermaid
flowchart LR
    B["Bootstrap service\nstatic discovery metadata"] --> D["Desktop peer"]
    D --> P["Community peer or member peer\nreplication + discovery"]

    B -. "never stores or validates" .-> R["Member records, balances, identities"]
```

## What it does

- Serves `GET /bootstrap` with a configured community ID, display name, discovery-core key, and optional fallback bootstrap URLs.
- Serves `GET /health` for deployment checks.
- Uses no database, Corestore, Hyperswarm instance, member feed, account system, or record API.

## What it must not do

- Approve, reject, identify, or register members.
- Store or relay timebank records, balances, messages, or member feeds.
- Operate as a community peer or as a canonical source of truth.
- Gate participation, collect fees, require accounts, or track people.

The bootstrap service is a convenience trust entry point: it tells a newly installed client which discovery scope to try. It does not decide whether any Peer Hours record is valid. A client that already has a discovery-core key—through an invitation, configuration, or cached manifest—can operate while this service is unavailable. Future work should add signed or pinned manifest verification and multiple bootstrap endpoints.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCOVERY_CORE_KEY` | Yes | 64-character hexadecimal public key of the community peer's discovery core. |
| `COMMUNITY_ID` | No | Defaults to `peer-hours/earth/US/CA/east-bay/oakland`. |
| `COMMUNITY_NAME` | No | Defaults to `Oakland Timebank`. |
| `BOOTSTRAP_NODES` | No | Comma-separated HTTP(S) fallback manifest URLs. |
| `COMMUNITY_NODE_URL` | No | HTTP(S) diagnostics URL for a separately deployed community peer. |
| `PORT` | No | Defaults to `10001`. |

Obtain `DISCOVERY_CORE_KEY` from the community peer operator's published configuration or from that peer's `/status` response during local development. The bootstrap service does not generate, persist, or inspect the key.

The process validates `PORT` before listening and rejects blank entries in `BOOTSTRAP_NODES` rather than silently changing the configured fallback set. It accepts `SIGINT` and `SIGTERM` by stopping HTTP intake; repeated signals share the same close operation. Deploy it behind HTTPS when it is internet-facing. Its CORS response remains intentionally public because the manifest is public discovery metadata, not a credential or authorization decision.

## Development

```sh
npm --workspace @peer-hours/bootstrap run build
DISCOVERY_CORE_KEY="<community-peer-core-key>" npm --workspace @peer-hours/bootstrap run start
```

Run checks with:

```sh
npm --workspace @peer-hours/bootstrap test
npm --workspace @peer-hours/bootstrap run typecheck
npm --workspace @peer-hours/bootstrap run build
```
