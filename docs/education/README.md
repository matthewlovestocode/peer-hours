# Learn Peer Hours

This is a short-lesson course for web developers who know browsers, HTTP APIs, and databases but are newer to local-first replication, Hypercore, and peer-to-peer systems.

Do not try to read every document at once. Each lesson introduces one idea, then connects it to the next one.

```mermaid
flowchart LR
    A["Start with timebanks"] --> B["Understand local-first networking"]
    B --> C["Learn append-only records"]
    C --> D["See how records become state"]
    D --> E["Learn signatures and trust"]
    E --> F["Understand the unfinished write path"]
```

## How to use this course

Each lesson aims for roughly 3–8 minutes. Look for these recurring sections:

- **What you already know** translates from a familiar client/server idea.
- **One small example** focuses on one behavior, not a full application.
- **Peer Hours connection** explains why the idea matters in this repository.
- **Verified today** and **not solved yet** keep implementation facts separate from future design.

## Part 1 — Start with the people and the community

1. [What is a timebank?](01-what-is-a-timebank.md)
2. [What is a Peer Hours community?](02-what-is-a-community.md)
3. [Desktop app and community node](03-desktop-app-and-community-node.md)
4. [What is a peer?](04-what-is-a-peer.md)
5. [Why members do not host servers](05-why-members-do-not-host-servers.md)
6. [What local-first means](06-what-local-first-means.md)
7. [Offline work and online settlement](07-offline-and-online-work.md)

## Part 2 — Replace the usual server mental model

8. [Where is the database?](08-where-is-the-database.md)
9. [Why the app keeps local data](09-local-app-data.md)
10. [What a community node is responsible for](10-community-node-responsibility.md)
11. [What a bootstrap endpoint does](11-bootstrap-endpoint.md)
12. [Why bootstrap is not the central server](12-bootstrap-is-not-central-authority.md)
13. [What happens when the desktop starts](13-desktop-startup.md)
14. [What happens when a peer connects](14-peer-connection.md)
15. [Why connection status is not a boolean](15-connection-status-is-not-a-boolean.md)

## Part 3 — Append-only storage and replication

16. [What is an append-only log?](16-append-only-log.md)
17. [Why records are not edited in place](17-no-in-place-edits.md)
18. [What a Hypercore key means](18-hypercore-key.md)
19. [What Corestore does](19-corestore.md)
20. [What replication means](20-replication.md)
21. [What happens while a peer is offline](21-offline-peers.md)
22. [What a record envelope is](22-record-envelope.md)
23. [What a record core is](23-record-core.md)

## Next course batches

These lessons are deliberately planned but not yet written. They will be added as the corresponding code paths become stable.

### Part 4 — From records to app state

24. [Raw records versus a useful screen](24-raw-records-and-useful-screens.md)
25. What “resolve” means
26. Why order-independent results matter
27. What a member-key authorization is
28. What an accepted proposal is
29. What a transfer is
30. Why balance is derived instead of stored
31. How one transfer changes two balances

### Part 5 — Trust and signatures

32. What a key pair is
33. What a public key is safe to share
34. What a private key must never leave
35. What an Ed25519 signature proves
36. Why a transfer has two attestations
37. What a payload digest is
38. Why replicated does not automatically mean trusted
39. The unresolved community-authority problem

### Part 6 — The unfinished write path

40. Why desktop members cannot write to the community core yet
41. Single-writer and multiwriter logs
42. Why per-member feeds may help
43. What conflict resolution means here
44. What “settled” should mean to a member
45. What still needs community policy instead of code
46. How the first member workflow will be built

### Part 7 — Learning from the running system

47. Read the community bootstrap response
48. Inspect a record core
49. Run two local runtimes
50. Follow one record through replication
51. Read a resolved ledger view
52. Diagnose an unavailable community node
53. Explain a stale peer
54. Choose the next safe experiment

## Current implementation references

- [Peer runtime package](../../packages/peer-runtime/README.md)
- [Record-core replication](../record-replication.md)
- [Package architecture](../package-architecture.md)
- [Identity attestations](../identity-attestations.md)
- [Ledger settlement](../ledger-settlement.md)
