# Lesson 4: What Is a Peer?

A peer is any running Peer Hours runtime that can exchange replicated data with another runtime. A member’s embedded desktop runtime is a peer. A community node is also a peer when it is online and participating.

## What you already know

In a browser application, the browser is usually only a client and the API server is usually only a server. Peer-to-peer systems use a different mental model: a connected participant can receive data and share data. Its role depends on what it is currently allowed and able to do.

```mermaid
flowchart LR
  A["Maya's desktop peer"] <-->|shares records| C["Community node peer"]
  C <-->|shares records| B["Omar's desktop peer"]
  A <-.->|"may connect directly later"| B
```

“Peer” describes network participation. It does not mean that every peer has equal permissions or must stay online forever.

## A small example

The Network workspace might report:

```text
Your peer: online
Community nodes: 1
Live remote peers: 2
```

**Expected observation:** “your peer” is the runtime inside the desktop app. The two remote peers are other connected runtimes. The community node count describes available infrastructure, not a separate kind of member.

## Peer Hours connection

Peer Hours uses precise language because it prevents an important misunderstanding. A **community node** is independently deployed, always-available infrastructure. A **peer** is any participating runtime, including the desktop app’s embedded runtime. We avoid saying “peer node” when one of those clearer terms is meant.

Later lessons will introduce how peers find each other and replicate records. First, it helps to understand why member desktops are peers without also being servers.

## Next lesson

Continue to [Lesson 5: Why Members Do Not Host Servers](./05-why-members-do-not-host-servers.md)
