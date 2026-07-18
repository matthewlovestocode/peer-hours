# Peer Hours Network Architecture

This is a living architecture note. It records the current direction for Peer Hours and should be revised as implementation and community needs make the design clearer.

## Purpose

Peer Hours is intended to be a reusable set of peer-to-peer tools for timebank communities.

The system is inspired by the Bay Area Community Exchange (BACE) timebank model: members offer and request services, exchange equal-valued time credits, and build community through participation rather than treating time as a conventional monetary commodity.

Peer Hours exists because this model can benefit from technology that is more resilient, portable, and adaptable to the needs of modern communities.

## Core direction

Peer Hours should be a **federated, local-first timebank network**.

Regular members use applications. They do not need to run servers or maintain permanently online infrastructure.

Separate online nodes are operated by communities, cooperatives, nonprofits, or independent participants. These nodes replicate data, keep the network available, support synchronization, and help connected users discover one another.

```text
Member applications
  ├── Local identity and data
  ├── Offers and requests
  ├── Offline composition and browsing
  └── Synchronization when connected

Community and replication nodes
  ├── Replicate listings and signed transactions
  ├── Keep data available while members are offline
  ├── Relay connected members
  ├── Support discovery within a community
  └── Participate in transaction validation
```

The system should not depend on one central application server, while still remaining practical for people who simply want to use a timebank.

## Offline and online behavior

Offers and requests are asynchronous records. A member should be able to create, edit, and queue them while offline. They synchronize to one or more nodes when connectivity becomes available.

Economic settlement is different. A completed exchange should require the relevant parties to be online, either directly or through reachable nodes. Both parties sign the transaction, and the signed event is replicated before the exchange is considered finalized.

The working principle is:

> Offline actions may be prepared and shared later; economic settlement must be explicitly signed, synchronized, and recoverable.

This distinction avoids requiring members to be continuously connected while preserving a clear boundary around when a time-credit transaction becomes final.

## Nodes and federation

Nodes are deployable infrastructure, not required software for every member.

A node may be hosted on a small VPS, a home server, a Raspberry Pi, or another suitable environment. Different nodes may have different roles:

- A community node serving one local timebank
- A public relay node supporting connectivity
- An archive node preserving historical ledger data
- A private node operated by a cooperative or organization
- A lightweight node replicating only selected communities

The initial model should favor federated communities. Each community can control its own membership, moderation, policies, and credit rules while using shared software and protocols. Inter-community exchange can be added later rather than assumed from the beginning.

## Trust and accounting

Users should own their identities and sign the activity they create. Nodes provide availability, replication, discovery, and community coordination; they should not silently mutate a member's history or balance.

The likely accounting foundation is a signed, append-only event history rather than a mutable balance field. A completed exchange would record at least:

- The provider
- The recipient
- The amount of time credit
- A description or reference to the exchange
- Creation and completion timestamps
- References to related events
- Signatures from the relevant participants

Cryptography can establish who agreed to an event. It cannot establish that a service was safe, high quality, or honestly described. Trust, moderation, dispute resolution, and community policy remain necessary parts of the product.

## Likely applications

```text
apps/
├── desktop/       # Primary member-facing Electron + React application
├── node/          # Headless deployable replication node
└── admin/         # Possible community administration interface
```

Only `desktop` exists today. The node and admin applications should be added when their first concrete workflows are understood.

## Possible shared packages

These are potential boundaries, not a commitment to create all of them now:

```text
packages/
├── identity/      # Keys, identities, and device authorization
├── listings/      # Offers and requests
├── ledger/        # Signed time-credit transactions and balances
├── sync/          # Replication and conflict handling
├── protocol/      # Network message formats and serialization
└── policy/        # Community-configurable rules
```

Packages should be created when there is a real reuse case or a stable domain boundary. We should avoid creating a generic `core` package simply because the repository has a `packages/` directory.

## First useful prototype

The first vertical slice should remain narrow and complete:

1. Create a local member identity.
2. Create an offer or request while offline.
3. Synchronize it with a node.
4. Discover another member and agree to an exchange.
5. Complete and sign the transaction.
6. Replicate the transaction.
7. Display both resulting balances.
8. Exercise one cancellation, disagreement, or recovery case.

This should reveal the real boundaries between the desktop app, node, protocol, identity, listings, and ledger before those boundaries become packages.

## Questions to resolve over time

- Is each community an isolated ledger, or can communities interoperate?
- What exactly constitutes a node quorum or transaction acknowledgment?
- Can a member configure multiple nodes for redundancy?
- What happens when two devices make conflicting offline edits?
- How are lost devices, key rotation, and account recovery handled?
- Can trusted relays act on behalf of members who are rarely online?
- Are negative balances allowed, and are debt limits community-configurable?
- Can hours be donated to individuals, groups, or a community pool?
- Which information is private, member-visible, community-visible, or public?
- How are disputes, fraud, harmful behavior, and invalid transactions handled?

These questions should be answered through small experiments and community conversations rather than settled prematurely in the repository structure.
