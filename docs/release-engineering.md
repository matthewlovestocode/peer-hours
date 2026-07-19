# Release engineering

Peer Hours has a repeatable source-validation baseline, but it does **not** yet
publish independently verifiable desktop releases or support automatic updates.
This guide makes that boundary explicit and describes the evidence required
before a pilot deployment. See [decentralized distribution and release
trust](decentralized-distribution.md) for the project direction: a commercial
platform certificate can be a convenience layer, never a prerequisite for a
Peer Hours release to exist.

## Continuous validation

The `Verify` GitHub Actions workflow runs for pull requests and pushes to
`main`. It uses the committed lockfile with `npm ci`, then runs dependency
auditing, tests, type checks, and builds on the current Electron-supported Node
baseline (22.12.0) and the current Node release line. The workflow has
read-only repository permission and cancels superseded runs for the same ref.

The scheduled `Dependency security review` workflow runs the same locked
dependency audit each Monday. Dependabot also opens grouped weekly npm update
pull requests and monthly GitHub Actions update pull requests. An advisory is
not silently fixed in production: each update remains a reviewed source change
and must pass the full validation suite.

Run the equivalent local gate from a clean checkout:

```sh
npm ci
npm --workspaces=false run verify
```

`npm --workspaces=false run verify` fails on high or critical npm advisories. The production
dependency audit currently excludes development-only packages when assessing a
deployed community node, but release candidates must pass the full audit too.
Do not use `npm audit fix --force` as a release procedure; it can make
unreviewed major dependency changes.

## Release candidate procedure

1. Start from a clean worktree at the reviewed commit on `main`.
2. Record the commit SHA, intended community deployment, release owner, and
   rollback owner in the deployment record.
3. Run `npm ci` and `npm run verify`; retain links to successful CI runs.
4. Review Dependabot and audit findings, including advisories without an
   automatic fix. Verify the locked Electron version is supported and free of
   known high or critical advisories.
5. Build the desktop application with
   `npm --workspace @peer-hours/desktop run package:mac` on a controlled macOS
   release machine. Inspect the resulting `.dmg` and `.zip` before they are
   distributed. These artifacts are intentionally not committed.
6. Back up each community node, deploy one node at a time, and confirm its
   `/health` and `/status` endpoints before moving to the next node.
7. Use a separate pilot identity to exercise discovery, replication, a
   complete exchange, a locally admitted transfer, and the expected durability
   receipt labels.
8. Retain the prior known-good desktop build and node revision. If validation
   or post-deploy checks fail, stop rollout and roll back code without deleting
   durable node data.

## Current release boundaries

The following are required before calling a public desktop release
production-ready, and are not supplied by the current repository:

- a project-controlled release manifest, checksum publication, documented
  release-key custody, and independently discoverable release-key fingerprint;
- a signed update feed with rollback/revocation behavior, member-visible
  update information, and no ability to alter member identity or trust choices;
- platform-specific package verification and install/upgrade testing on every
  supported desktop operating-system version;
- an external vulnerability-review process for Electron, native dependencies,
  and the release environment; and
- an incident process for revoking a compromised signing or update key.

Until those controls exist, desktop artifacts are reviewed pilot builds, not
general-public releases. Community nodes remain independently operated
infrastructure: release automation must never grant a vendor or node operator
authority over member identity, balances, or record truth. Optional Apple,
Microsoft, package-repository, or third-party signing credentials must be
treated as platform-installation conveniences, not the root of project trust.
