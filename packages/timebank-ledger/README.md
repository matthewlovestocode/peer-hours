# @peer-hours/timebank-ledger

`@peer-hours/timebank-ledger` is the pure settlement and balance-derivation library for Peer Hours. It turns verified, community-scoped transfers into immutable postings and derived member balances.

It is intentionally independent of the desktop app, community nodes, storage, replication, and any particular cryptography implementation. That keeps the rules that move time credits explicit, deterministic, and testable on every participating runtime.

## Role in Peer Hours

```mermaid
flowchart LR
    D["@peer-hours/timebank-domain\naccepted proposal"] --> S["@peer-hours/timebank-settlement\nproposal-to-transfer validation"]
    T["Candidate transfer"] --> S
    S --> I["@peer-hours/timebank-identity\nmember-key verification"]
    I --> L["@peer-hours/timebank-ledger\nverified transfers → postings → balances"]
    L --> R["Future replicated records\nand local views"]
```

The ledger is the accounting boundary. The domain package describes member agreements; the identity package determines whether a participant attestation is valid; the settlement package checks a transfer against an accepted proposal. This package only applies transfers that have already satisfied its structural rules and supplied verifier.

## Current responsibilities

- Create immutable, structurally valid transfers.
- Require a distinct provider and recipient, positive whole-minute amounts, and exactly one attestation from each participant.
- Require a settlement transfer to identify its source proposal; require a compensating reversal to identify the transfer it reverses.
- Delegate attestation verification to a caller-supplied `SignatureVerifier`.
- Apply transfers deterministically for one community, deduplicating identical transfer replay and rejecting same-ID conflicts.
- Prevent more than one ordinary settlement transfer for a source proposal.
- Apply ordinary settlements in stable transfer-ID order and enforce a configurable minimum balance.
- Use Peer Hours' default minimum of negative 3,000 minutes (negative 50 hours), while allowing compensating reversals to restore a balance.
- Derive equal-and-opposite postings and balances from verified transfers.
- Validate compensating reversals without editing or deleting the original transfer.

## Explicit non-responsibilities

- It does not create, accept, or look up proposals.
- It does not perform cryptography, manage keys, or decide which member keys are authorized. Use `@peer-hours/timebank-identity` to supply an Ed25519 verifier.
- It does not persist, replicate, discover, or synchronize transfers.
- It does not decide who has authority to operate a community or authorize/revoke a member key.
- It does not resolve disputes or prevent concurrent spending across disconnected replicas. The deterministic minimum-balance policy resolves competing replicated transfers after the fact; it cannot promise that an offline proposal will settle.
- It does not make `sourceProposalId` a network-level proof that an accepted proposal exists. That linkage is currently checked in memory by `@peer-hours/timebank-settlement`; replicated record resolution remains future work.

## Public API and concepts

### Transfers and attestations

A `Transfer` is an immutable community-scoped settlement record. Ordinary settlements include `sourceProposalId`; reversals include `reversesTransferId`. A `TransferAttestation` names the participant, their `keyId`, a `payloadDigest`, and a signature. This package validates that both participants attest, then gives each attestation and transfer to the injected verifier.

The ledger has no concept of a replicated envelope author. In the current record resolver, either transfer participant may author the member-signed envelope that carries a settlement transfer, but that submitter signature never replaces the ledger's required provider and recipient attestations.

Use `createTransfer(input)` to validate and normalize a transfer. It does not verify the signatures itself.

### Verification boundary

`SignatureVerifier` is a function that receives `{ transfer, attestation }` and returns whether that attestation verifies for that exact transfer. The ledger accepts this dependency instead of importing a cryptography library. `@peer-hours/timebank-identity` provides the current Ed25519 implementation.

### Derived ledger view

Use `applyTransfers({ communityId, transfers, verifyAttestation })` to create a `Ledger`. The current protocol policy is `DEFAULT_PEER_HOURS_LEDGER_POLICY`, whose `minimumBalanceMinutes` is fixed at `-3000` (negative 50 hours). A future change to this shared boundary needs an explicit, replicated policy protocol; individual callers cannot override it.

Ordinary settlements are applied by stable transfer ID. If an otherwise valid settlement would take its recipient below the configured minimum, it is retained as a `rejectedTransfer` with the `minimum-balance` reason and produces no postings. A compensating reversal is not subject to this boundary because it exactly undoes an earlier accepted transfer; a reversal of a rejected settlement is itself rejected with `unaccepted-reversal`.

The result includes:

- `transfers`: verified, accepted transfers in stable ID order.
- `rejectedTransfers`: verified ordinary settlements excluded by the minimum-balance rule.
- `postings`: the equal-and-opposite per-member movements.
- `balances`: the balance record derived from those postings.

`derivePostings(transfer)` is also exported for the two postings associated with one structurally valid transfer.

## Dependencies

This package has no runtime package dependencies. Its only development dependencies support TypeScript compilation and tests. The absence of a crypto, storage, or network dependency is deliberate.

## Validation

From the repository root:

```sh
npm --workspace @peer-hours/timebank-ledger test
npm --workspace @peer-hours/timebank-ledger run typecheck
npm --workspace @peer-hours/timebank-ledger run build
```

Run the full repository checks before integrating a cross-package change:

```sh
npm test
npm run typecheck
npm run build
```
