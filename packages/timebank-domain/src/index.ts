/** A stable identifier for a Peer Hours member. */
export type MemberId = string;

/** The participation state of a member within one community. */
export type MemberStatus = "active" | "inactive";

/** A community-scoped member profile used to authorize domain actions. */
export interface MemberProfile {
  readonly id: MemberId;
  readonly communityId: string;
  readonly displayName: string;
  readonly status: MemberStatus;
}

/** The lifecycle state of a member-owned offer or request. */
export type ListingStatus = "draft" | "published" | "closed";

/** The kind of service listing a member creates. */
export type ListingKind = "offer" | "request";

/** A member-owned offer or request for a bounded whole number of minutes. */
export interface Listing {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: MemberId;
  readonly kind: ListingKind;
  readonly title: string;
  readonly minutes: number;
  readonly status: ListingStatus;
}

/** The lifecycle state of a proposed exchange. */
export type ExchangeProposalStatus = "proposed" | "accepted";

/** A proposed transfer of time from an offer owner to a request owner. */
export interface ExchangeProposal {
  readonly id: string;
  readonly communityId: string;
  readonly offerId: string;
  readonly requestId: string;
  readonly providerMemberId: MemberId;
  readonly receiverMemberId: MemberId;
  readonly creatorMemberId: MemberId;
  readonly acceptedByMemberId?: MemberId;
  readonly minutes: number;
  readonly status: ExchangeProposalStatus;
}

/** Input required to create a community-scoped member profile. */
export interface CreateMemberProfileInput {
  readonly id: MemberId;
  readonly communityId: string;
  readonly displayName: string;
  readonly status?: MemberStatus;
}

/** Input required to create a member-owned offer or request draft. */
export interface CreateListingInput {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: MemberId;
  readonly title: string;
  readonly minutes: number;
}

/** Input required to publish a listing draft for its active owner. */
export interface PublishListingInput {
  readonly listing: Listing;
  readonly owner: MemberProfile;
}

/** Input required to propose an exchange between one offer and one request. */
export interface ProposeExchangeInput {
  readonly id: string;
  readonly offer: Listing;
  readonly request: Listing;
  readonly provider: MemberProfile;
  readonly recipient: MemberProfile;
  readonly creatorMemberId: MemberId;
  readonly minutes: number;
}

/** Input required to accept an existing proposed exchange. */
export interface AcceptExchangeProposalInput {
  readonly proposal: ExchangeProposal;
  readonly offer: Listing;
  readonly request: Listing;
  readonly provider: MemberProfile;
  readonly recipient: MemberProfile;
  readonly acceptedByMemberId: MemberId;
}

/** Error raised when an action violates an explicit timebank domain rule. */
export class DomainRuleError extends Error {
  /** Creates a domain-rule error with a readable explanation. */
  constructor(message: string) {
    super(message);
    this.name = "DomainRuleError";
  }
}

/** Creates a member profile with an explicit active or inactive community status. */
export function createMemberProfile(input: CreateMemberProfileInput): MemberProfile {
  assertPresent(input.id, "Member id");
  assertPresent(input.communityId, "Community id");
  assertPresent(input.displayName, "Member display name");

  const status = input.status ?? "active";
  if (status !== "active" && status !== "inactive") {
    throw new DomainRuleError("Member status must be active or inactive.");
  }

  return { ...input, status };
}

/** Creates a draft, member-owned offer for a positive whole number of minutes. */
export function createOffer(input: CreateListingInput): Listing {
  return createListing("offer", input);
}

/** Creates a draft, member-owned request for a positive whole number of minutes. */
export function createRequest(input: CreateListingInput): Listing {
  return createListing("request", input);
}

/** Publishes a draft only when the supplied active profile owns it in the same community. */
export function publishListing(input: PublishListingInput): Listing {
  const { listing, owner } = input;

  if (listing.status !== "draft") {
    throw new DomainRuleError("Only draft listings can be published.");
  }

  assertActiveListingOwner(listing, owner);
  return { ...listing, status: "published" };
}

/** Proposes a valid exchange from one published offer to one published request. */
export function proposeExchange(input: ProposeExchangeInput): ExchangeProposal {
  const { offer, request, provider, recipient, creatorMemberId, minutes } = input;
  assertMatchableListings(offer, request, minutes);
  assertProposalParticipants(offer, request, provider, recipient);
  assertProposalCreator(creatorMemberId, provider.id, recipient.id);

  return {
    id: input.id,
    communityId: offer.communityId,
    offerId: offer.id,
    requestId: request.id,
    providerMemberId: provider.id,
    receiverMemberId: recipient.id,
    creatorMemberId,
    minutes,
    status: "proposed",
  };
}

/** Accepts a valid proposal only when the other active participant accepts it. */
export function acceptExchangeProposal(input: AcceptExchangeProposalInput): ExchangeProposal {
  const { proposal, offer, request, provider, recipient, acceptedByMemberId } = input;

  if (proposal.status !== "proposed") {
    throw new DomainRuleError("Only proposed exchanges can be accepted.");
  }

  if (
    proposal.offerId !== offer.id ||
    proposal.requestId !== request.id ||
    proposal.communityId !== offer.communityId ||
    proposal.providerMemberId !== provider.id ||
    proposal.receiverMemberId !== recipient.id
  ) {
    throw new DomainRuleError("The proposal does not match the supplied listings and participants.");
  }

  assertMatchableListings(offer, request, proposal.minutes);
  assertProposalParticipants(offer, request, provider, recipient);
  assertProposalCreator(proposal.creatorMemberId, provider.id, recipient.id);

  const otherParticipantId = proposal.creatorMemberId === provider.id ? recipient.id : provider.id;
  if (acceptedByMemberId !== otherParticipantId) {
    throw new DomainRuleError("Only the other proposal participant can accept an exchange.");
  }

  return { ...proposal, status: "accepted", acceptedByMemberId };
}

/** Creates and validates one member-owned listing in its initial draft state. */
function createListing(kind: ListingKind, input: CreateListingInput): Listing {
  assertPresent(input.id, "Listing id");
  assertPresent(input.communityId, "Community id");
  assertPresent(input.memberId, "Member id");
  assertPresent(input.title, "Listing title");
  assertPositiveWholeMinutes(input.minutes);

  return { ...input, kind, status: "draft" };
}

/** Ensures a member profile is active and exactly matches the listing owner and community. */
function assertActiveListingOwner(listing: Listing, owner: MemberProfile): void {
  if (owner.id !== listing.memberId || owner.communityId !== listing.communityId) {
    throw new DomainRuleError("A listing can only be published by its owner in the same community.");
  }

  assertActiveMember(owner);
}

/** Ensures listings are published and eligible to form an exchange for the requested minutes. */
function assertMatchableListings(offer: Listing, request: Listing, minutes: number): void {
  if (offer.kind !== "offer" || request.kind !== "request") {
    throw new DomainRuleError("An exchange requires one offer and one request.");
  }

  if (offer.communityId !== request.communityId) {
    throw new DomainRuleError("An exchange requires listings from the same community.");
  }

  if (offer.status !== "published" || request.status !== "published") {
    throw new DomainRuleError("Only published listings are eligible for an exchange.");
  }

  if (offer.memberId === request.memberId) {
    throw new DomainRuleError("A member cannot exchange time with themself.");
  }

  assertPositiveWholeMinutes(minutes);

  if (minutes > offer.minutes || minutes > request.minutes) {
    throw new DomainRuleError("Proposed minutes must fit within both listings.");
  }
}

/** Ensures active provider and recipient profiles match their listing owners and community. */
function assertProposalParticipants(
  offer: Listing,
  request: Listing,
  provider: MemberProfile,
  recipient: MemberProfile,
): void {
  assertActiveListingOwner(offer, provider);
  assertActiveListingOwner(request, recipient);
}

/** Ensures an exchange creator is one of the active exchange participants. */
function assertProposalCreator(creatorMemberId: MemberId, providerMemberId: MemberId, recipientMemberId: MemberId): void {
  if (creatorMemberId !== providerMemberId && creatorMemberId !== recipientMemberId) {
    throw new DomainRuleError("An exchange proposal must be created by one of its participants.");
  }
}

/** Ensures a member profile can currently participate in community actions. */
function assertActiveMember(member: MemberProfile): void {
  if (member.status !== "active") {
    throw new DomainRuleError("Only active members can perform this action.");
  }
}

/** Ensures a time amount represents a positive, finite whole number of minutes. */
function assertPositiveWholeMinutes(minutes: number): void {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
    throw new DomainRuleError("Minute amounts must be positive whole numbers.");
  }
}

/** Ensures identifiers and titles contain meaningful non-whitespace content. */
function assertPresent(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new DomainRuleError(`${label} is required.`);
  }
}
