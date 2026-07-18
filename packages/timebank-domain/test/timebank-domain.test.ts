import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainRuleError,
  acceptExchangeProposal,
  createOffer,
  createMemberProfile,
  createRequest,
  publishListing,
  proposeExchange,
  type ExchangeProposal,
  type Listing,
  type MemberProfile,
} from "../src/index.js";

const providerId = "member-provider";
const receiverId = "member-receiver";
const communityId = "peer-hours/earth/US/CA/east-bay";

/** Creates a member fixture for a community participant. */
function member(id: string, overrides: Partial<MemberProfile> = {}): MemberProfile {
  return createMemberProfile({ id, communityId, displayName: id, ...overrides });
}

/** Creates a draft offer fixture owned by the provider. */
function draftOffer(overrides: Partial<Listing> = {}): Listing {
  return createOffer({
    id: "offer-garden-help",
    communityId,
    memberId: providerId,
    title: "Garden help",
    minutes: 120,
    ...overrides,
  });
}

/** Creates a draft request fixture owned by the receiver. */
function draftRequest(overrides: Partial<Listing> = {}): Listing {
  return createRequest({
    id: "request-garden-help",
    communityId,
    memberId: receiverId,
    title: "Garden help",
    minutes: 120,
    ...overrides,
  });
}

/** Publishes a listing using its corresponding owner fixture. */
function publishedListing(listing: Listing, owner: MemberProfile): Listing {
  return publishListing({ listing, owner });
}

/** Creates a published offer fixture with its provider. */
function publishedOffer(overrides: Partial<Listing> = {}): Listing {
  return publishedListing(draftOffer(overrides), member(providerId));
}

/** Creates a published request fixture with its recipient. */
function publishedRequest(overrides: Partial<Listing> = {}): Listing {
  return publishedListing(draftRequest(overrides), member(receiverId));
}

test("rejects non-positive, fractional, and non-finite listing minute amounts", () => {
  for (const minutes of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.throws(
      () =>
        createOffer({
          id: `offer-${String(minutes)}`,
          communityId,
          memberId: providerId,
          title: "Garden help",
          minutes,
        }),
      DomainRuleError,
    );
  }
});

test("member profiles retain their validated identity and community fields without participation gating", () => {
  assert.deepEqual(member(providerId), {
    id: providerId,
    communityId,
    displayName: providerId,
  });
});

test("listings begin as drafts and only their owner can publish them", () => {
  const draft = draftOffer();
  assert.equal(draft.status, "draft");

  assert.deepEqual(publishedListing(draft, member(providerId)), { ...draft, status: "published" });
  assert.throws(() => publishedListing(draft, member(receiverId)), DomainRuleError);
  assert.throws(
    () => publishedListing(draft, member(providerId, { communityId: "peer-hours/earth/online/software" })),
    DomainRuleError,
  );
});

test("only published listings are eligible for a proposed exchange", () => {
  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-draft-offer",
        offer: draftOffer(),
        request: publishedRequest(),
        provider: member(providerId),
        recipient: member(receiverId),
        creatorMemberId: providerId,
        minutes: 30,
      }),
    DomainRuleError,
  );

  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-draft-request",
        offer: publishedOffer(),
        request: draftRequest(),
        provider: member(providerId),
        recipient: member(receiverId),
        creatorMemberId: providerId,
        minutes: 30,
      }),
    DomainRuleError,
  );
});

test("matches published listings owned by same-community members within both minute amounts", () => {
  const proposal = proposeExchange({
    id: "proposal-garden-help",
    offer: publishedOffer(),
    request: publishedRequest(),
    provider: member(providerId),
    recipient: member(receiverId),
    creatorMemberId: providerId,
    minutes: 90,
  });

  assert.deepEqual(proposal, {
    id: "proposal-garden-help",
    communityId,
    offerId: "offer-garden-help",
    requestId: "request-garden-help",
    providerMemberId: providerId,
    receiverMemberId: receiverId,
    creatorMemberId: providerId,
    minutes: 90,
    status: "proposed",
  } satisfies ExchangeProposal);
});

test("rejects mismatched, cross-community, and self-matched proposal participants", () => {
  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-mismatched-provider",
        offer: publishedOffer(),
        request: publishedRequest(),
        provider: member("other-provider"),
        recipient: member(receiverId),
        creatorMemberId: providerId,
        minutes: 30,
      }),
    DomainRuleError,
  );

  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-cross-community-member",
        offer: publishedOffer(),
        request: publishedRequest(),
        provider: member(providerId),
        recipient: member(receiverId, { communityId: "peer-hours/earth/online/software" }),
        creatorMemberId: providerId,
        minutes: 30,
      }),
    DomainRuleError,
  );

  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-self-match",
        offer: publishedOffer(),
        request: publishedRequest({ memberId: providerId }),
        provider: member(providerId),
        recipient: member(providerId),
        creatorMemberId: providerId,
        minutes: 30,
      }),
    DomainRuleError,
  );
});

test("requires an exchange proposal creator to be a participating member", () => {
  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-third-party-creator",
        offer: publishedOffer(),
        request: publishedRequest(),
        provider: member(providerId),
        recipient: member(receiverId),
        creatorMemberId: "other-member",
        minutes: 30,
      }),
    DomainRuleError,
  );
});

test("rejects an exchange that exceeds a listing or crosses listing communities", () => {
  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-too-large",
        offer: publishedOffer(),
        request: publishedRequest(),
        provider: member(providerId),
        recipient: member(receiverId),
        creatorMemberId: providerId,
        minutes: 121,
      }),
    DomainRuleError,
  );

  assert.throws(
    () =>
      proposeExchange({
        id: "proposal-cross-community",
        offer: publishedOffer(),
        request: publishedRequest({ communityId: "peer-hours/earth/online/software" }),
        provider: member(providerId),
        recipient: member(receiverId, { communityId: "peer-hours/earth/online/software" }),
        creatorMemberId: providerId,
        minutes: 30,
      }),
    DomainRuleError,
  );
});

test("allows only the other proposal participant to accept a still-valid proposal", () => {
  const offer = publishedOffer();
  const request = publishedRequest();
  const provider = member(providerId);
  const recipient = member(receiverId);
  const proposal = proposeExchange({
    id: "proposal-garden-help",
    offer,
    request,
    provider,
    recipient,
    creatorMemberId: providerId,
    minutes: 120,
  });

  const accepted = acceptExchangeProposal({ proposal, offer, request, provider, recipient, acceptedByMemberId: receiverId });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.acceptedByMemberId, receiverId);

  assert.throws(
    () => acceptExchangeProposal({ proposal, offer, request, provider, recipient, acceptedByMemberId: providerId }),
    DomainRuleError,
  );
  assert.throws(
    () => acceptExchangeProposal({ proposal, offer, request, provider, recipient, acceptedByMemberId: "other-member" }),
    DomainRuleError,
  );
  assert.throws(
    () => acceptExchangeProposal({ proposal: accepted, offer, request, provider, recipient, acceptedByMemberId: receiverId }),
    DomainRuleError,
  );
  assert.throws(
    () => acceptExchangeProposal({ proposal, offer: { ...offer, status: "closed" }, request, provider, recipient, acceptedByMemberId: receiverId }),
    DomainRuleError,
  );
  assert.throws(
    () => acceptExchangeProposal({ proposal, offer, request: { ...request, id: "other-request" }, provider, recipient, acceptedByMemberId: receiverId }),
    DomainRuleError,
  );
});
