# Peer Hours

Peer Hours is an npm workspaces monorepo for desktop applications, community nodes, development peers, and shared packages. The repository contains an Electron + React desktop application, a headless community node, a development peer simulator, and a shared peer runtime.

## Repository structure

```text
peer-hours/
├── apps/
│   ├── desktop/             # Electron + React desktop application
│   ├── node/                # Headless community node
│   └── dev-peers/           # Real local peers for UI/network development
├── packages/
│   └── peer-runtime/        # Platform-neutral local peer runtime
├── package.json             # Root workspace and shared scripts
├── package-lock.json        # Locked dependency versions
├── tsconfig.json            # Root TypeScript project references
├── tsconfig.base.json       # Shared TypeScript compiler defaults
├── .npmrc                   # npm workspace settings
└── .gitignore
```

### `apps/`

Applications are deployable products. Each application has its own `package.json`, source tree, build configuration, and scripts. Applications should generally remain private and should not be published to npm.

The initial application is `@peer-hours/desktop`, an Electron application whose UI is built with React and Vite.

The `@peer-hours/node` application is a headless community node. It keeps persistent Hypercore storage, exposes `/bootstrap`, discovers peers with Hyperswarm, and reports peer status. It does not yet implement the Peer Hours ledger or multi-writer transaction rules.

Community identifiers use an `earth` root so the namespace can grow beyond Earth without renaming the terrestrial network later. For the full hierarchy and discovery model, see [the network architecture](docs/network-architecture.md#community-naming).

### `packages/`

Packages are for reusable code shared by two or more applications, such as UI components, domain logic, API clients, or configuration. A package intended for npm publication should use the organization scope, for example `@peer-hours/ui`.

Do not create a shared package speculatively. Add one when there is a concrete reuse case.

## Prerequisites

- Node.js 22.12 or newer is recommended for the Electron toolchain.
- npm 10 or newer.
- macOS is required to build and test macOS application artifacts locally.

Check your versions:

```sh
node --version
npm --version
```

## Getting started

From the repository root:

```sh
npm install
```

The root install configures dependencies for all npm workspaces. The resulting `node_modules/` directory and build output are ignored by Git.

## Development

The desktop application owns an embedded local peer runtime from `@peer-hours/peer-runtime`. It does not require a separately launched node for its local status view. Run an additional node when testing replication with another peer.

To run an additional local node, use terminal 1:

```sh
npm --workspace @peer-hours/node run build
npm --workspace @peer-hours/node run start
```

Confirm that it is available:

```sh
curl http://127.0.0.1:10000/health
curl http://127.0.0.1:10000/status
curl http://127.0.0.1:10000/bootstrap
```

In terminal 2, start the Vite development server and Electron together:

```sh
npm --workspace @peer-hours/desktop run dev
```

The desktop defaults to `http://127.0.0.1:10000/bootstrap`, fetches the community manifest and public core key, and joins its discovery topic. The desktop app owns an embedded peer runtime and reports its own identity, community metadata, peer roster, and replication status.

To start real simulated peers for the network tree, use a third terminal:

```sh
npm --workspace @peer-hours/dev-peers run build
PEER_COUNT=5 npm --workspace @peer-hours/dev-peers run start
```

Each simulated peer has its own identity and storage directory and bootstraps through the same community-node endpoint as the desktop.

To use a remote bootstrap node, set `PEER_HOURS_BOOTSTRAP_URL` before starting the desktop. To bypass HTTP bootstrap for a local test, set `PEER_HOURS_BOOTSTRAP_KEY` directly.

If Electron reports that it did not install correctly, repair its downloaded runtime from the repository root:

```sh
npm --workspaces=false rebuild electron --foreground-scripts
```

### Desktop checks and packaging

Run the desktop application’s checks and production build:

```sh
npm --workspace @peer-hours/desktop run typecheck
npm --workspace @peer-hours/desktop run build
```

Create macOS distributables:

```sh
npm --workspace @peer-hours/desktop run package:mac
```

The packaged `.dmg` and `.zip` files are written to the desktop workspace’s `dist/` directory. These artifacts are ignored by Git.

## Replication node

The default local community is `peer-hours/earth/US/CA/east-bay`. Override it with `COMMUNITY_ID` when running a different geographic or online community. Examples include `peer-hours/earth/US/CA/east-bay/oakland` and `peer-hours/earth/online/software`.

Build and start the node locally:

```sh
npm --workspace @peer-hours/node run build
npm --workspace @peer-hours/node run start
```

By default, node data is stored in `apps/node/data/`. Set `DATA_DIR` to use another location, such as a mounted Render disk:

```sh
DATA_DIR=/var/data npm --workspace @peer-hours/node run start
```

The health check is available at `http://127.0.0.1:10000/health`. For Render, use `npm --workspace @peer-hours/node run build` as the build command and `npm --workspace @peer-hours/node run start` as the start command. Render supplies the `PORT` environment variable.

## Root commands

The root scripts run the corresponding script in every workspace that defines it:

```sh
npm run typecheck
npm run build
npm run clean
npm test
```

Run a command for a specific workspace with either its package name or path:

```sh
npm --workspace @peer-hours/desktop run build
npm --workspace apps/desktop run dev
```

The node workspace currently uses Node’s built-in test runner through `tsx`:

```sh
npm --workspace @peer-hours/node test
```

Tests live in the workspace’s `test/` directory. The first test covers the node health payload; replication and ledger integration tests should be added as those behaviors are implemented.

## Adding a new application

Create a directory under `apps/` with its own `package.json`:

```text
apps/
├── desktop/
└── another-app/
    ├── package.json
    └── src/
```

Give it a unique package name, usually under the private `@peer-hours/` scope, and define at least `dev`, `build`, and `typecheck` scripts where applicable. After adding it, run:

```sh
npm install
npm run typecheck
```

## Adding a shared package

Create a directory under `packages/` with its own `package.json`, source tree, and TypeScript configuration. Applications can depend on it using its workspace package name:

```json
{
  "dependencies": {
    "@peer-hours/example": "0.1.0"
  }
}
```

Keep unpublished internal packages private. For a package that should be published to npm, use the `@peer-hours/` scope and add:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

## Git and npm conventions

- Commit source, configuration, and `package-lock.json`.
- Do not commit `node_modules`, build output, logs, TypeScript build metadata, or `.env` files.
- Keep secrets in local environment files; only commit `.env.example` templates.
- Use focused commits that describe one repository change.
- Review package `private` and `publishConfig` settings before publishing anything to npm.

## Current npm organization

The npm scope is `@peer-hours`. The organization is owned by the npm account `mtstewart`. Applications remain private; future reusable packages may be published individually under the organization scope.
