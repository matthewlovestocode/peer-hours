import type { PeerStatus } from "../../status.js";

/** Identifies peers that are connected or whose connection attempt is still active. */
export function isLivePeer(peer: PeerStatus): boolean {
  return peer.lifecycleState === "connected" || peer.lifecycleState === "connecting";
}

/** Maps a lifecycle state to the visual tone used by the shared status indicator. */
export function lifecycleTone(state: PeerStatus["lifecycleState"]): "good" | "warn" | "bad" | "neutral" {
  if (state === "connected") return "good";
  if (state === "stale" || state === "connecting") return "warn";
  if (state === "offline") return "bad";
  return "neutral";
}

/** Converts a protocol lifecycle state into concise user-facing language. */
export function lifecycleLabel(state: PeerStatus["lifecycleState"]): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

/** Formats the elapsed time since a peer last reported activity. */
export function formatAge(timestamp: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}
