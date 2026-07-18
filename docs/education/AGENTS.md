# Educational Documentation Rules

Educational documentation in this directory should teach the system visually and incrementally.

- Prefer Mermaid diagrams for architecture, data flow, lifecycle, replication, and state transitions.
- Use focused code examples that demonstrate one idea at a time.
- Introduce concepts in layers: local data, append-only logs, replication, peer discovery, multi-writer state, then Peer Hours behavior.
- Explain what each library contributes and what it does not do.
- Connect every low-level example back to a concrete Peer Hours use case.
- Include expected output or observable behavior for runnable examples.
- Distinguish verified behavior from proposed architecture.
- Keep educational material separate from decision records and implementation plans in the rest of `docs/`.
- Revise lessons as the implementation changes; avoid letting examples become stale.
