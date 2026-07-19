/** Describes whether this device can safely participate in a member's timebank activity. */
export type IdentityPresentation = {
  tone: "ready" | "attention" | "blocked";
  heading: string;
  detail: string;
};

/** Converts private-key availability into clear, member-facing membership status copy. */
export function identityPresentation(identity: { state: "unavailable" | "not-created" | "ready" }): IdentityPresentation {
  if (identity.state === "ready") {
    return {
      tone: "ready",
      heading: "Your membership is ready",
      detail: "This device can securely create and sign your timebank activity.",
    };
  }

  if (identity.state === "not-created") {
    return {
      tone: "attention",
      heading: "Set up your membership to begin",
      detail: "This creates the secure identity you use for community activity. It does not create an offer, request, or completed exchange.",
    };
  }

  return {
    tone: "blocked",
    heading: "Secure storage is unavailable",
    detail: "This device cannot safely create or sign your activity until operating-system secure storage is available.",
  };
}

/** Explains the scope of a public community identifier without presenting it as a secret. */
export function communityScopeLabel(communityId: string | null): string {
  return communityId
    ? "Your activity is checked within this community. This identifier is public community information, not a password."
    : "This device has not reported a community identifier yet.";
}
