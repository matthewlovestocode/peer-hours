import type { ResolvedMemberState } from "./types.js";

/** Represents the local verifier's current level of confidence in the visible member-feed data. */
export type RecordsTrustStatus = {
  tone: "ready" | "attention" | "blocked";
  heading: string;
  detail: string;
};

/** Converts verification and feed availability into compact, truthful local-trust language. */
export function recordsTrustStatus(resolved: ResolvedMemberState | null, rawRecordCount: number): RecordsTrustStatus {
  if (resolved?.state === "ready") {
    return {
      tone: "ready",
      heading: "Verified state is available",
      detail: `${rawRecordCount} raw ${rawRecordCount === 1 ? "entry is" : "entries are"} available for inspection. Only records shown in “Locally accepted state” passed this device’s checks; local acceptance is not a claim of replication or settlement finality.`,
    };
  }

  if (resolved?.state === "rejected") {
    return {
      tone: "blocked",
      heading: "Raw history was not accepted",
      detail: `This device rejected part of the raw history: ${resolved.reason} Inspect the raw entries below for diagnosis; do not treat them as accepted workflow state.`,
    };
  }

  if (resolved?.state === "unavailable") {
    return {
      tone: "attention",
      heading: "Verification is temporarily unavailable",
      detail: `${resolved.reason} Raw history remains available for inspection, but no workflow state should be inferred until verification recovers.`,
    };
  }

  return {
    tone: "attention",
    heading: "Verification has not completed",
    detail: "Raw history may be visible while this device opens its local feed and evaluates records. Wait for a locally accepted state before acting on a listing or proposal.",
  };
}
