# @peer-hours/timebank-records

`@peer-hours/timebank-records` is the record-protocol composition layer for Peer Hours. It defines immutable envelopes for timebank events and turns replicated record histories into the existing domain, identity, settlement, and ledger inputs.

It is an internal workspace package today (`private: true`), not a published npm package.

## Intended role

```mermaid
flowchart LR
    Store["Replicated Hypercore records"] --> Records["@peer-hours/timebank-records"]
    Records --> Domain["Domain records"]
    Records --> Identity["Key lifecycle records"]
    Records --> Transfer["Transfer records"]
    Domain --> Resolve["Deterministic resolved view"]
    Identity --> Resolve
    Transfer --> Resolve
    Resolve --> Ledger["Verified ledger and balances"]
```

This package is the adapter between replicated data and pure timebank rules. It owns the shared event envelope, member-signed envelope admission, record-kind mappings, replay/conflict detection, and deterministic read models. It does not replace the underlying domain packages.

## Boundaries

- `@peer-hours/peer-runtime` owns local Hypercore storage and network transport.
- `@peer-hours/timebank-domain` owns member, listing, and agreement rules.
- `@peer-hours/timebank-identity` owns key lifecycle reduction and Ed25519 transfer verification.
- `@peer-hours/timebank-settlement` owns proposal-to-transfer matching.
- `@peer-hours/timebank-ledger` owns verified transfer application and balances.

The record protocol must never place business rules solely in serialization or transport adapters. It should make every replicated event traceable to one of those pure boundaries.

## Not yet a trust protocol

Accepted-proposal and transfer records now require an active, community-scoped member key to sign every immutable envelope term before the resolver admits them. That protects the current deterministic read model from unsigned, tampered, inactive-key, cross-community, and unrelated-member submissions.

The resolver also applies the implemented record-authorship rules:

- An accepted-proposal envelope must be authored and signed by the member recorded as accepting that proposal. A proposal creator cannot publish an acceptance on the other member's behalf.
- A settlement-transfer envelope may be authored and signed by either its provider or its recipient. Separately, the ledger requires valid attestations from **both** participants over the exact transfer terms before it derives balances. The envelope author is the submitter of the replicated record, not a substitute for the second attestation.

This is not the complete trust protocol. Self-owned identity/feed binding, identity-record signatures, user-controlled filtering, member-feed replication, and multiwriter ordering remain protocol work. Peer Hours has decided against membership approval as the participation gate; the current supplied authorization-list verifier is a temporary implementation boundary, not the future authority model. Desktop members cannot yet write timebank records to the shared core, so these verified resolver rules are not yet an exposed member-submission protocol.

## Development

```sh
npm --workspace @peer-hours/timebank-records test
npm --workspace @peer-hours/timebank-records run typecheck
npm --workspace @peer-hours/timebank-records run build
```
