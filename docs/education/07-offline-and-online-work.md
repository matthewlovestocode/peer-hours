# Lesson 7: Offline Work and Online Settlement

Peer Hours separates activities that are useful offline from actions that change the shared timebank record. Members can prepare or view some information without a connection, but a completed exchange must be settled online so the participating runtimes can share and verify it.

## What you already know

This is similar to a shopping cart versus a completed payment. You can draft a cart locally. Charging a card requires contacting the payment system. In Peer Hours, an offer or request can be drafted locally, while a time transfer needs connected participants and replicated records.

```mermaid
flowchart LR
  D["Offline: draft an offer\nor request"] --> L["Saved locally"]
  L --> C["Online: connect to community"]
  C --> A["Both participants attest\nto the completed exchange"]
  A --> R["Verified transfer record\nreplicates"]
```

The online requirement protects the shared accounting history. It gives the system a chance to validate the transfer and make it available to the community.

## A small example

Ravi and Elena agree that Ravi helped for 60 minutes.

```text
Offline: Ravi drafts “60 minutes of tutoring completed.”
Online: Ravi and Elena connect and each approve the same transfer terms.
Result: the signed transfer can be replicated and balances update.
```

**Expected observation:** drafting alone does not change either balance. Both attestations and online replication are required before the shared ledger treats it as settled.

## Peer Hours connection

The current packages model this distinction: proposals describe an intended exchange; settlement validates a transfer against an accepted proposal; identity verifies the participants’ signatures; the ledger derives the two balance changes. The network-write portion is still being built, so this describes the intended member workflow rather than a finished desktop feature.

This boundary is deliberate. It lets people record needs and offers in everyday life while treating shared time-credit settlement as a verifiable, connected action.

## Next lesson

Continue to [Lesson 8: Where Is the Database?](./08-where-is-the-database.md) to replace the usual single-server storage mental model.
