import type { ResolvedMemberState } from "./types.js";

/** Represents this device's current confidence in the visible member activity. */
export type RecordsTrustStatus = {
  tone: "ready" | "attention" | "blocked";
  heading: string;
  detail: string;
};

/** Converts verification and feed availability into compact, truthful member-facing language. */
export function recordsTrustStatus(resolved: ResolvedMemberState | null, rawRecordCount: number): RecordsTrustStatus {
  if (resolved?.state === "ready") {
    return {
      tone: "ready",
      heading: "Your activity is ready",
      detail: `${rawRecordCount} signed ${rawRecordCount === 1 ? "entry is" : "entries are"} available. The activity shown below passed this device’s checks; this does not by itself prove that another peer has received it or that an exchange is complete.`,
    };
  }

  if (resolved?.state === "rejected") {
    return {
      tone: "blocked",
      heading: "Some activity needs attention",
      detail: `This device could not safely use part of your activity: ${resolved.reason} Your signed history is still available below, but avoid acting on the affected item until this is resolved.`,
    };
  }

  if (resolved?.state === "unavailable") {
    return {
      tone: "attention",
      heading: "Activity status is temporarily unavailable",
      detail: `${resolved.reason} Your signed history remains available below, but wait to act on it until this check recovers.`,
    };
  }

  return {
    tone: "attention",
    heading: "Checking your activity",
    detail: "Your signed history may appear while this device checks it. Wait for the activity status above before acting on an offer or request.",
  };
}
