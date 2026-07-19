# Public website

`apps/web` is the public-facing Peer Hours site. It explains the project, provides a future home for verifiable desktop releases, and helps people discover communities that deliberately chose to be visible. It is not a member application, a protocol authority, or an account service.

## What it is for

- Explain the local-first, peer-to-peer, not-for-profit model in plain language.
- Offer versioned desktop downloads with release notes and integrity information once releases exist.
- Help a person find an opt-in community invitation and understand how to verify it.
- Link to the open source implementation and explain its limits honestly.

The currently implemented static routes are the landing page, how-it-works, download, open-source, community directory, and invitation-verification explanation.

## Directory boundary

A web directory is useful for discovery but must never become a gatekeeper. A future listing should be a signed, opt-in publication containing public community metadata, a genesis-feed key, a discovery key, and a human-readable fingerprint. The desktop app must independently fetch and verify the genesis record before it saves or joins a community.

The website must not:

- approve or reject membership;
- store member private keys or feeds;
- decide which records are true;
- make directory availability a prerequisite for existing members to reconnect; or
- present a listing as social proof without explaining that people should compare the fingerprint through another channel they trust.

The initial directory page is intentionally a labeled preview, not a fake working directory. Its only sample card does not expose an invitation or claim that a community is accepting members.

## Release boundary

The current download controls are disabled. Before enabling a release, the site needs a repeatable published-release process that includes versioned platform installers, release notes, source revision, checksums or platform-appropriate signature verification, supported operating-system guidance, and a recovery path for a compromised release. A convenient download page must not ask people to trust an unverifiable binary.

## Operations

The site can be statically hosted. Its loss would remove a discovery and explanation channel, but it must not remove a member's identity, local records, known community keys, or ability to reconnect directly with reachable peers. That separation is a core product property, not merely a deployment preference.
