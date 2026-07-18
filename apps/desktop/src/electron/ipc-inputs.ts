/** A renderer-originated listing request that has passed main-process boundary validation. */
export type PublishListingRequest = { readonly kind: "offer" | "request"; readonly title: string; readonly minutes: number };

/** A renderer-originated proposal request that has passed main-process boundary validation. */
export type CreateProposalRequest = { readonly offerId: string; readonly requestId: string; readonly minutes: number };

/** Validates a compact renderer identifier before it is used to resolve a signed record. */
export function parseRecordId(value: unknown, label = "Record id"): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

/** Validates a renderer-selected listing identifier before local verified-state lookup. */
export function parseListingId(value: unknown): string {
  return parseRecordId(value, "Listing id");
}

/** Validates a listing request before it reaches the signing service or domain constructors. */
export function parsePublishListingRequest(value: unknown): PublishListingRequest {
  if (!isRecord(value) || (value.kind !== "offer" && value.kind !== "request")) {
    throw new Error("Listing kind must be an offer or request.");
  }
  return {
    kind: value.kind,
    title: parseTitle(value.title),
    minutes: parseMinutes(value.minutes),
  };
}

/** Validates proposal selection and duration before any community records are opened. */
export function parseCreateProposalRequest(value: unknown): CreateProposalRequest {
  if (!isRecord(value)) throw new Error("Proposal details are invalid.");
  return {
    offerId: parseRecordId(value.offerId, "Offer id"),
    requestId: parseRecordId(value.requestId, "Request id"),
    minutes: parseMinutes(value.minutes),
  };
}

/** Narrows an unknown IPC argument without accepting arrays or null values as objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects blank or excessively large text before it can become an immutable signed record. */
function parseTitle(value: unknown): string {
  if (typeof value !== "string") throw new Error("Listing title is invalid.");
  const title = value.trim();
  if (title.length === 0 || title.length > 500) throw new Error("Listing title must contain 1 to 500 characters.");
  return title;
}

/** Restricts renderer numbers to positive safe whole-minute values. */
function parseMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Minutes must be a positive whole number.");
  }
  return value;
}
