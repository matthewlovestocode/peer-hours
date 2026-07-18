# Lesson 34: What Private Keys Must Never Leave

A private key is the authority to create a signature as its owner. If it is copied to a server, renderer process, log, or another person, that copy can impersonate the owner.

```mermaid
flowchart LR
  K["Private key"] --> M["Desktop main process\nor OS keystore"]
  M --> S["Sign locally"]
  S --> P["Public record + signature"]
  K -. "never" .-> R["Electron renderer"]
  K -. "never" .-> N["Community peer / bootstrap service"]
  K -. "never" .-> L["Replicated Hypercore feed"]
```

## What you already know

An API secret in browser JavaScript is effectively public because anyone can inspect it. A private signing key has the same problem, with worse consequences: it could authorize false records.

```ts
// Safe boundary: sign in trusted local code.
const signature = await signingService.sign(canonicalBytes);

// Unsafe: never send privateKey to a renderer or HTTP endpoint.
```

**Expected observation:** peers receive only a signature and public verification material. They can validate the claim but cannot produce a replacement signature.

## Peer Hours connection

The current design keeps member private keys out of the desktop renderer and community-peer public API. Hardware-backed or operating-system-backed key storage is a production hardening path, not a current implementation claim.

## Takeaway

Replication should spread verifiable evidence, never the secret that creates it.

## Next lesson

Continue with [Lesson 35: What an Ed25519 signature proves](35-ed25519-signatures.md).
