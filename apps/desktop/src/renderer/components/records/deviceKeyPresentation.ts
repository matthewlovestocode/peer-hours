/** Converts a replicated device-key lifecycle state into plain member-facing status text. */
export function deviceKeyStateLabel(state: "active" | "revoked"): string {
  return state === "active" ? "Active" : "Revoked";
}

/** Explains why lifecycle records protect recovery without overstating what is available today. */
export function deviceKeyRecoveryGuidance(): string {
  return "Add an overlapping device key before retiring a device. Revocation is permanent and replicated; it never changes prior records, balances, or community dispute outcomes.";
}

/** Formats a public lifecycle timestamp defensively for a compact member-facing status view. */
export function deviceKeyOccurredLabel(occurredAt: string): string {
  const parsed = new Date(occurredAt);
  return Number.isNaN(parsed.getTime()) ? "Recorded time unavailable" : `Recorded ${parsed.toLocaleString()}`;
}
