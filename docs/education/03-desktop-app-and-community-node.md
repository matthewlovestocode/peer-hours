# Lesson 3: Desktop App vs Community Node

Peer Hours has two different kinds of software. The desktop app is for a member using the timebank. A community node is always-available infrastructure operated for that community.

## What you already know

In client/server development, you might picture a browser client and one API server. The closest translation is helpful, but incomplete: a Peer Hours desktop app keeps useful data locally and participates in replication. A community node helps data remain available when members close their apps.

```mermaid
flowchart LR
  M["Member desktop app\nUI + local peer runtime"] <-->|replication| N["Community node\npersistent availability"]
  N <-->|replication| P["Another member desktop\nUI + local peer runtime"]
```

The community node is not just a web API that owns all truth. It is a reliable participant that stores and shares replicated community data.

## A small example

In the planned member workflow, suppose Maya publishes an offer while her desktop is running:

```text
Maya's desktop stores the offer locally.
Maya's desktop connects to the community node.
The community node receives a replicated copy.
Maya closes her desktop.
```

**Expected observation:** after the signed record is replicated, a community peer can retain Maya's feed for other connected participants. Maya does not need to keep her laptop running all day. The desktop offer-publishing screen is not implemented yet.

## Peer Hours connection

The repository contains `apps/desktop` for the Electron member application and `apps/node` for the headless community node. Keeping their roles distinct protects the member experience from server-operations concerns while still making the network resilient.

This design can use web-style HTTP endpoints for bootstrap or diagnostics, but replication is the more important path for sharing timebank records.

## Takeaway

The desktop is a member's local application and peer. A community peer is optional always-on support infrastructure, not a central database or approval service.

## Next lesson

Continue to [Lesson 4: What Is a Peer?](./04-what-is-a-peer.md)
