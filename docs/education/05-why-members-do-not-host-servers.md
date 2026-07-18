# Lesson 5: Why Members Do Not Host Servers

A member’s Peer Hours desktop app participates in the network while it is open. It is not expected to be a permanently reachable server. Community nodes provide the always-available layer instead.

## What you already know

You may have deployed an API to a cloud host so it is always reachable. Asking every member to do that would require technical skill, stable networking, security maintenance, and a machine that never sleeps. That is not a reasonable requirement for joining a timebank.

```mermaid
flowchart TB
  A["Member laptop\nopen sometimes"] -->|replicates when online| N["Community node\nonline continuously"]
  B["Member laptop\nopen sometimes"] -->|replicates when online| N
  N --> S["Persistent community data\navailable between visits"]
```

The node improves availability without changing a member into an infrastructure operator.

## A small example

Consider two evenings:

```text
6 PM: Asha's desktop connects and receives recent records.
7 PM: Asha closes the app and her laptop sleeps.
9 PM: Ben opens Peer Hours and connects to the community node.
```

**Expected observation:** Ben can still obtain records retained by the community node. He does not need a live connection to Asha’s laptop.

## Peer Hours connection

This is why Peer Hours plans for independently deployed community nodes. They support discovery, persistence, and replication for a particular timebank. They do not make ordinary members responsible for uptime.

Peer Hours now has a first answer for that question: after two compatible peers meet through a shared discovery scope, a member can send a root-signed, short-lived announcement naming their feed. The announcement contains the feed identity and expiry, not private contact information. The receiving peer validates the signature and opens the feed for replication. The remaining work is to put that deliberate publication choice into the desktop UI and test it over real Hyperswarm discovery, not just direct test connections.

## Takeaway

Members can participate when their desktop is open. Independently operated community peers improve availability so participation never requires every member to become a server operator.

## Next lesson

Continue to [Lesson 6: What Local-First Means](./06-what-local-first-means.md)
