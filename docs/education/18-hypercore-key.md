# Lesson 18: What Is a Hypercore Key?

A Hypercore public key identifies one particular append-only log. If two peers know the same key, they are talking about the same log and can verify blocks received for it.

## What you already know

You may be used to identifying a database with a connection string:

```text
postgres://app:password@db.example.com/peer_hours
```

That string tells a client where a central service lives and how to authenticate to it. A Hypercore key is different. It identifies data itself, not a web server location. Peer discovery and connection happen separately.

```mermaid
flowchart LR
  K["Record-core public key"] --> A["Peer A opens this log"]
  K --> B["Peer B opens this log"]
  A <-->|"replicate verified blocks"| B
```

## A tiny example

```text
record core key:
ab12...ef90

Peer A opens core ab12...ef90
Peer B opens core ab12...ef90
```

**Expected observation:** both peers refer to the same ordered history, even though each stores its own local copy. The key is normally displayed or configured as a hexadecimal string, but the real key material is binary.

A public key is safe to share. It is not a password and does not grant someone the ability to append to a log. Writing is controlled by the log's writer key and the application’s authorization design.

## Peer Hours connection

`PeerRuntime` exposes a `recordCoreKey` in its status data. A community node includes that key in its `/bootstrap` response, allowing a desktop runtime to open the community-owned record core as a reader. The desktop’s Network view can show the full key so a developer can inspect which record history the runtime is following.

This key identifies a record core, not a timebank member. Member signing keys used to attest transfers are a separate identity concept managed by `@peer-hours/timebank-identity`.

## Takeaway

A core key answers “which append-only history?” It does not answer “where is the server?” or “who is this member?”

## Next lesson

Continue to [Lesson 19: What is Corestore?](./19-corestore.md).
