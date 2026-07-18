# Desktop App Agent Rules

## Purpose

This is the member-facing Peer Hours application. It is an Electron application with a React renderer and should remain usable as a local-first client that synchronizes with Peer Hours nodes when connected.

The desktop app is also expected to contain the member's local Peer Hours peer runtime. It should not depend on a separately launched local node for normal operation. The Electron main process may own local storage, identity, and Holepunch connectivity while the renderer uses a narrow preload boundary.

## First product milestone: network visibility

Before building timebank workflows, invest substantially in a polished network status experience. The desktop app should make it easy to understand:

- Whether the local node/client is online or offline
- Which Peer Hours nodes are configured and reachable
- Which peers are currently connected
- How recently each peer was seen
- Whether data is syncing, synchronized, stalled, or conflicted
- Replication progress and pending local changes
- Connection errors, retries, and the next retry time
- Which node or peer supplied a piece of synchronized data when that matters

This is a primary user experience, not merely a developer diagnostics panel. Prefer clear status language, useful detail on demand, timestamps, connection lifecycle feedback, and polished empty/loading/error states. Do not hide network uncertainty behind a generic green or red indicator.

## Architecture

- Keep Electron main-process code in `src/electron/`.
- Keep React renderer code in `src/renderer/`.
- Keep the renderer isolated from Node and Electron APIs.
- Use preload APIs and `contextBridge` for narrowly scoped main-process capabilities.
- Keep synchronization and domain behavior out of React components.
- Do not put private keys or sensitive data in renderer globals, URLs, or logs.

## UI development

- Every React component and helper function added to the desktop app must have a JSDoc-style comment immediately above its definition explaining its purpose. Keep the explanation focused on what the unit is responsible for and any important boundary it preserves.
- Build feature components on top of separately defined, reusable UI primitives. Primitives should own their baseline behavior, accessibility, variants, and styling.
- Keep primitive components and their styles organized separately from feature-specific components. Do not duplicate primitive styling across screens.
- Prefer composition of primitives over large components that combine layout, data fetching, state, and presentation.
- If shared client state is needed, prefer Zustand. Use local React state for genuinely local interaction state and avoid introducing a state library when props or local state are sufficient.
- Keep Zustand stores focused by domain; do not create one global store for unrelated UI, synchronization, and domain concerns.
- Build small, understandable components before introducing a UI framework or state-management library.
- Keep user-visible states explicit: offline, syncing, synchronized, pending, failed, and conflicted.
- Do not imply that a transaction is finalized until the protocol confirms it.
- Prefer accessible controls and readable empty/loading/error states.

## Validation

Use the desktop workspace scripts:

```sh
npm --workspace @peer-hours/desktop run typecheck
npm --workspace @peer-hours/desktop run build
npm --workspace @peer-hours/desktop test
```

Add UI tests when meaningful user workflows exist. Do not add a browser-testing framework solely to test the initial placeholder screen.
