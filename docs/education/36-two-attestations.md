# Lesson 36: Why a Transfer Has Two Attestations

An exchange affects two people. Peer Hours therefore requires the provider and recipient to independently attest to the same transfer terms before the ledger derives balances.

```mermaid
sequenceDiagram
  participant A as Alex, provider
  participant B as Bri, recipient
  participant L as Local ledger
  A->>A: Acknowledge completion; sign 60-minute transfer terms
  B->>B: Acknowledge completion; sign the same transfer terms
  A->>L: Provider attestation
  B->>L: Recipient attestation
  L->>L: Verify both before posting +60 / −60
```

## One small example

```ts
const transfer = {
  providerAttestation: alexSignature,
  recipientAttestation: briSignature,
};

ledger.apply(transfer); // only after both verify
```

**Expected observation:** one valid signature is insufficient. A missing, invalid, cross-community, or mismatched participant signature prevents ledger admission. Likewise, even two valid signatures do not admit a normal settlement until both participants have published matching acknowledgements.

## Peer Hours connection

The transfer envelope may be authored by either participant, but the envelope author is not a substitute for the second attestation. Dual-confirmed acknowledgements are separate completion evidence, not a substitute for either attestation. This distinction protects the agreement rule without giving a community peer authority to approve the exchange.

## Takeaway

Two attestations mean both affected people signed the same settlement, even if either one replicated its envelope.

## Next lesson

Continue with [Lesson 37: What a payload digest is](37-payload-digest.md).
