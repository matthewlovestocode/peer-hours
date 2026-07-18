/** Describes the member's ability to sign and publish records from this device. */
export type IdentityPresentation = {
  tone: "ready" | "attention" | "blocked";
  heading: string;
  detail: string;
};

/** Converts private-key availability into clear, non-finality-claiming member-facing status copy. */
export function identityPresentation(identity: { state: "unavailable" | "not-created" | "ready" }): IdentityPresentation {
  if (identity.state === "ready") {
    return {
      tone: "ready",
      heading: "Identity ready on this device",
      detail: "This device can sign new member records using its locally protected key.",
    };
  }

  if (identity.state === "not-created") {
    return {
      tone: "attention",
      heading: "Create your local identity to begin",
      detail: "Creating an identity opens a member feed and announces its public identity to this community. It does not publish an offer, request, or settlement.",
    };
  }

  return {
    tone: "blocked",
    heading: "Secure key storage is unavailable",
    detail: "This device cannot safely create or sign member records until operating-system secure storage is available.",
  };
}

/** Explains the scope of a public community identifier without exposing it as a secret. */
export function communityScopeLabel(communityId: string | null): string {
  return communityId
    ? "Records shown here are evaluated within the community identified below. A community identifier is public routing and verification context, not a password."
    : "This device has not reported a community identifier, so community scope cannot yet be confirmed.";
}
