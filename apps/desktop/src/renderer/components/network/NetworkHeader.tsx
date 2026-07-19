import { StatusDot } from "../Primitive.js";

/** Displays a compact network workspace summary and the current connection conclusion. */
export function NetworkHeader({ connected, state }: { connected: boolean; state: string }) {
  const tone = connected ? "good" : state === "connecting" ? "warn" : state === "error" ? "bad" : "neutral";
  const label = connected ? "Connected" : state === "connecting" ? "Connecting" : state === "error" ? "Connection issue" : "Not connected";

  return (
    <header className="network-page__header">
      <div>
        <h1>Connection health</h1>
        <p className="muted">Connections, replication, and your local peer.</p>
      </div>
      <div className="connection-pill">
        <StatusDot tone={tone} />
        <span>{label}</span>
      </div>
    </header>
  );
}
