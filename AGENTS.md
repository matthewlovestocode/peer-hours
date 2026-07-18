# Peer Hours Agent Rules

## Project purpose

Peer Hours is a federated, local-first timebank system. Desktop applications serve members; independently deployed nodes provide persistent storage, discovery, and replication. The project is inspired by the BACE timebank model but should evolve toward a more resilient and adaptable peer-to-peer system.

## Repository structure

- `apps/desktop/` — Electron + React member-facing application.
- `apps/node/` — Headless replication node.
- `packages/` — Shared libraries created only when there is a concrete reuse case.
- `docs/` — Living product, architecture, and implementation notes.

## General development rules

- Read the relevant `AGENTS.md` files before changing code.
- Prefer small, focused changes that preserve the current working architecture.
- Do not create speculative packages or abstractions.
- Keep applications private. Only intentionally reusable npm packages may be publishable.
- Keep domain rules explicit and testable; do not hide business behavior in UI or transport code.
- Do not introduce a central-server assumption into code intended for replicated operation.
- Preserve local-first behavior where practical: local state should be understandable and recoverable.
- Do not commit secrets, local environment files, dependencies, build output, or TypeScript build metadata.
- Do not commit local runtime state. In particular, `apps/node/data/` contains the node's local persistent store and must remain ignored.

## Validation

Before handing off a change, run the narrowest relevant checks and then the repository checks when practical:

```sh
npm test
npm run typecheck
npm run build
```

Update tests when behavior changes. Prefer integration tests for synchronization, persistence, and protocol behavior.

## Documentation

Use `docs/` as a living workspace. Documentation is expected to be revised repeatedly as implementation teaches us more. Do not impose templates or create formal specifications prematurely.

Record important architectural decisions, unresolved questions, and observed behavior. Keep documentation aligned with the code, but do not turn every implementation detail into a permanent rule.

The `docs/education/` area is reserved for teaching material and is intentionally separate from architecture and planning notes. Educational documentation should favor visual explanations, especially Mermaid diagrams, small charts, progressive examples, and runnable code. Explain how Hypercore, Corestore, Hyperswarm, Autobase, and related libraries work together before showing how those pieces form Peer Hours. Optimize for readers learning the system, not only for contributors looking up a reference.

## Git

- Use clear, focused commit messages.
- Do not rewrite or discard existing user work.
- Do not commit or push unless explicitly requested.
- Inspect the diff and run relevant validation before committing.
