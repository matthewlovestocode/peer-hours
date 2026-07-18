import type { LocalPeerStatus } from "@peer-hours/peer-runtime";
import { Metric } from "./Primitive.js";

type LocalRuntimeTiming = {
  startedAt?: unknown;
  uptimeMs?: unknown;
};

type LocalRuntimeUptimeProps = {
  status: LocalPeerStatus | null;
};

/** Formats a reported runtime duration without deriving it from network or synchronization activity. */
function formatUptime(uptimeMs: number): string {
  const totalSeconds = Math.floor(uptimeMs / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Reads optional runtime timing fields so the renderer stays compatible while peer-runtime rolls them out. */
function getRuntimeTiming(status: LocalPeerStatus | null): { startedAt: Date | null; uptimeMs: number | null } {
  if (!status) return { startedAt: null, uptimeMs: null };

  const timing = status as LocalPeerStatus & LocalRuntimeTiming;
  const startedAt = typeof timing.startedAt === "string" && !Number.isNaN(Date.parse(timing.startedAt))
    ? new Date(timing.startedAt)
    : null;
  const uptimeMs = typeof timing.uptimeMs === "number" && Number.isFinite(timing.uptimeMs) && timing.uptimeMs >= 0
    ? timing.uptimeMs
    : null;

  return { startedAt, uptimeMs };
}

/** Shows local runtime duration while keeping runtime lifetime distinct from connection and replication health. */
export function LocalRuntimeUptime({ status }: LocalRuntimeUptimeProps) {
  const { startedAt, uptimeMs } = getRuntimeTiming(status);

  if (uptimeMs === null) {
    return <Metric label="Local runtime" value="Timing unavailable" detail="Runtime uptime has not been reported yet." />;
  }

  return <Metric
    label="Local runtime"
    value={formatUptime(uptimeMs)}
    detail={startedAt ? `Started ${startedAt.toLocaleTimeString()}; not a sync indicator` : "Runtime duration; not a sync indicator"}
  />;
}
